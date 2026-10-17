"""Download the credited open films used by Hearth Cinema. No paid APIs."""
import hashlib
from pathlib import Path
import shutil
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1] / 'public' / 'media'
FILMS = [
    ('big-buck-bunny.mp4', 'https://download.blender.org/peach/bigbuckbunny_movies/BigBuckBunny_640x360.m4v.zip', 'BigBuckBunny_640x360.m4v', '738e2f999860553d056dd79c952f58f63cbb73892a57c72342ce9e5330d9d2d7'),
    ('sintel-trailer.mp4', 'https://media.w3.org/2010/05/sintel/trailer.mp4', None, 'b670602fa00934ca27c4351bb0efe7ea7a07fae57284e44226025eeed7c51254'),
]

def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    for name, url, member, expected in FILMS:
        target = ROOT / name
        if target.exists() and digest(target) == expected:
            print(name, 'verified')
            continue
        with tempfile.TemporaryDirectory() as directory:
            download = Path(directory) / 'download'
            with urllib.request.urlopen(url, timeout=120) as response, download.open('wb') as output:
                shutil.copyfileobj(response, output)
            extracted = Path(directory) / name
            if member:
                with zipfile.ZipFile(download) as archive, archive.open(member) as source, extracted.open('wb') as output:
                    shutil.copyfileobj(source, output)
            else:
                download.rename(extracted)
            if digest(extracted) != expected:
                raise RuntimeError('Upstream film changed: ' + name)
            shutil.copy2(extracted, target)
        print(name, 'downloaded and verified')

if __name__ == '__main__':
    main()
