#!/usr/bin/env python3
"""Backfill the archive with short clips from Immich, through the capture API.

Read-only on Immich (a SELECT) and on the media files. Dry run unless --apply.
client_uuid is the Immich asset id, so re-running never duplicates a clip.
Clips are tagged device_model "immich-import" so they stay distinguishable from live captures.
Selection is round-robin across years, then random within a year; the media itself is never inspected.
"""
import argparse, json, os, sqlite3, subprocess, sys, tempfile

ARCHIVE_DB = os.environ.get('ARCHIVE_DB', '/mnt/usbssd/museum-data/archive/archive.sqlite')
HOST_ROOT = os.path.expanduser('~/resilio-sync/sync/iphone_photos')
CONTAINER_ROOT = '/home/user/iphone_photos/'
TYPES = {'.mov': 'video/quicktime', '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.3gp': 'video/3gpp'}

SQL = """
select row_to_json(t) from (
  select a.id, a."originalPath" as path,
    split_part(a.duration,':',1)::int*3600+split_part(a.duration,':',2)::int*60+split_part(a.duration,':',3)::numeric as secs,
    to_char(a."localDateTime" at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS') as local_ts,
    round(extract(epoch from (a."localDateTime" - a."fileCreatedAt"))/900)*15 as offset_min,
    e.latitude as lat, e.longitude as lon, e."timeZone" as tz,
    row_number() over (partition by extract(year from a."localDateTime") order by random()) as rn,
    extract(year from a."localDateTime") as yr
  from asset a left join asset_exif e on e."assetId" = a.id
  where a.type = 'VIDEO' and a."deletedAt" is null and a."isOffline" = false and a.visibility = 'timeline'
    and a.duration is not null
    and split_part(a.duration,':',1)::int*3600+split_part(a.duration,':',2)::int*60+split_part(a.duration,':',3)::numeric between {lo} and {hi}
) t order by rn, yr
"""


def candidates(lo, hi):
    out = subprocess.run(
        ['docker', '-c', 'rootless', 'exec', 'immich_postgres', 'psql', '-U', 'postgres', '-d', 'immich', '-At', '-c',
         SQL.format(lo=lo, hi=hi)], capture_output=True, text=True, check=True).stdout
    return [json.loads(l) for l in out.splitlines() if l.strip()]


def offset_str(minutes):
    m = int(minutes)
    s = '+' if m >= 0 else '-'
    return f'{s}{abs(m)//60:02d}:{abs(m)%60:02d}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--count', type=int, default=24)
    ap.add_argument('--min-seconds', type=float, default=2.0)
    ap.add_argument('--max-seconds', type=float, default=5.0)
    ap.add_argument('--max-mb', type=float, default=30)
    ap.add_argument('--url', default='http://127.0.0.1:8001/api/captures')
    ap.add_argument('--apply', action='store_true')
    args = ap.parse_args()

    db = sqlite3.connect(f'file:{ARCHIVE_DB}?mode=ro', uri=True)
    have = {r[0] for r in db.execute('select client_uuid from captures')}
    db.close()
    picked, skipped = [], 0
    for c in candidates(args.min_seconds, args.max_seconds):
        if len(picked) >= args.count:
            break
        if c['id'] in have:
            continue
        if not c['path'].startswith(CONTAINER_ROOT):
            skipped += 1
            continue
        host = os.path.join(HOST_ROOT, c['path'][len(CONTAINER_ROOT):])
        ext = os.path.splitext(host)[1].lower()
        if ext not in TYPES or not os.path.isfile(host) or os.path.getsize(host) > args.max_mb * 1048576:
            skipped += 1
            continue
        picked.append((c, host, ext))

    print(f'{len(picked)} selected, {skipped} skipped (unreadable, odd type or too large); mode: {"APPLY" if args.apply else "dry run"}')
    ok = dup = bad = 0
    for c, host, ext in picked:
        meta = {
            'client_uuid': c['id'],
            'captured_at': c['local_ts'] + offset_str(c['offset_min']),
            'timezone': c['tz'],
            'mode': 'clip',
            'requested_seconds': max(1, min(60, round(float(c['secs'])))),
            'lat': c['lat'], 'lon': c['lon'], 'accuracy_m': None,
            'device_model': 'immich-import', 'device_os': None,
        }
        line = f"{meta['captured_at']} {float(c['secs']):.1f}s {os.path.getsize(host)/1048576:.1f}MB {'gps' if c['lat'] is not None else 'no-gps'}"
        if not args.apply:
            print('  would import', line)
            continue
        with tempfile.NamedTemporaryFile('w', suffix='.json') as mf:
            json.dump(meta, mf); mf.flush()
            r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-F', f'metadata=<{mf.name}',
                                '-F', f'recording=@{host};type={TYPES[ext]}', args.url], capture_output=True, text=True)
        code = r.stdout.strip()
        if code == '201': ok += 1
        elif code == '200': dup += 1
        else: bad += 1
        print(f'  {code} {line}')
    if args.apply:
        print(f'done: {ok} new, {dup} already present, {bad} failed')


if __name__ == '__main__':
    sys.exit(main())
