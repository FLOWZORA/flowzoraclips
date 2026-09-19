import sys
import os
import glob
import json
import yt_dlp

class NullLogger:
    def debug(self, msg): pass
    def info(self, msg): pass
    def warning(self, msg): pass
    def error(self, msg): pass

def main():
    if len(sys.argv) < 3:
        sys.exit(1)

    url = sys.argv[1]
    out_prefix = sys.argv[2]
    outtmpl = f"{out_prefix}.%(ext)s"
    meta_path = f"{out_prefix}.meta.json"

    ydl_opts = {
        'format': 'ba[ext=m4a]/ba[ext=mp3]/ba',
        'outtmpl': outtmpl,
        'max_filesize': 20 * 1024 * 1024,
        'quiet': True,
        'no_warnings': True,
        'noprogress': True,
        'logger': NullLogger(),
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])

        found = [f for f in glob.glob(f"{out_prefix}.*") if not f.endswith('.meta.json')]
        if found:
            with open(meta_path, 'w', encoding='utf-8') as f:
                json.dump({'success': True, 'filePath': found[0]}, f)
            sys.exit(0)
        else:
            with open(meta_path, 'w', encoding='utf-8') as f:
                json.dump({'success': False, 'error': 'No audio file found after download'}, f)
            sys.exit(1)
    except Exception as e:
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump({'success': False, 'error': str(e)}, f)
        sys.exit(1)

if __name__ == '__main__':
    main()
