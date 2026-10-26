#!/usr/bin/env python3
"""Repère/supprime les PNG redondants si un WebP homonyme existe.

Par défaut : audit sans modification.
Avec --delete : supprime seulement les PNG sans référence textuelle détectée.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from urllib.parse import quote

SKIP_DIRS = {
    '.git', 'node_modules', '.pnpm', '.venv', '__pycache__',
    '.cache', 'dist', 'build', 'coverage', '.next',
}
TEXT_EXTS = {
    '.yml', '.yaml', '.json', '.jsonl', '.jsonc', '.js', '.mjs', '.cjs',
    '.ts', '.tsx', '.jsx', '.css', '.scss', '.html', '.htm', '.md', '.txt',
    '.svg', '.xml', '.toml', '.ini', '.csv', '.hbs', '.handlebars',
    '.webmanifest', '.vue', '.svelte',
}


def is_visible_source(p: Path, root: Path) -> bool:
    return not any(part in SKIP_DIRS for part in p.relative_to(root).parts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path.cwd(), help='Racine du dépôt (défaut : dossier courant)')
    parser.add_argument('--delete', action='store_true', help='Supprime les PNG doublons non référencés')
    args = parser.parse_args()
    root = args.root.resolve()
    assets = root / 'assets'
    if not assets.is_dir():
        parser.error(f'Dossier assets/ introuvable dans {root}. Lancer le script à la racine du dépôt.')

    png_files = sorted(
        (p for p in assets.rglob('*') if p.is_file() and p.suffix.lower() == '.png'),
        key=lambda p: str(p)
    )
    duplicates = [(png, png.with_suffix('.webp')) for png in png_files if png.with_suffix('.webp').is_file()]

    # Construire un index des références à partir des fichiers texte. Pour éviter les
    # faux négatifs, rechercher aussi le nom de fichier seul, et sa variante URL-encodée.
    # Cela peut provoquer des faux positifs (PNG conservé inutilement), jamais l'inverse.
    names: dict[str, set[Path]] = {}
    for png, _ in duplicates:
        names.setdefault(png.name, set()).add(png)
        encoded = quote(png.name)
        if encoded != png.name:
            names.setdefault(encoded, set()).add(png)

    refs: dict[Path, list[Path]] = {png: [] for png, _ in duplicates}
    source_count = 0
    for path in root.rglob('*'):
        if not path.is_file() or path.suffix.lower() not in TEXT_EXTS or not is_visible_source(path, root):
            continue
        try:
            data = path.read_bytes()
            if b'\x00' in data[:4096]:
                continue
            content = data.decode('utf-8')
        except (OSError, UnicodeDecodeError):
            continue
        source_count += 1
        for name, png_set in names.items():
            if name in content:
                for png in png_set:
                    refs[png].append(path)

    print(f'Racine : {root}')
    print(f'PNG trouvés : {len(png_files)}')
    print(f'Doublons PNG/WebP : {len(duplicates)}')
    print(f'Fichiers texte inspectés : {source_count}')
    print(f'Mode : {"SUPPRESSION" if args.delete else "AUDIT (aucune modification)"}\n')
    removable = 0
    blocked = 0
    for png, webp in duplicates:
        label = png.relative_to(root)
        if refs[png]:
            blocked += 1
            unique_refs = sorted(set(refs[png]), key=str)
            print(f'[CONSERVER : références trouvées] {label}')
            for ref in unique_refs[:4]:
                print(f'    - {ref.relative_to(root)}')
            if len(unique_refs) > 4:
                print(f'    - ... et {len(unique_refs) - 4} autre(s)')
        else:
            removable += 1
            if args.delete:
                png.unlink()
                print(f'[SUPPRIMÉ] {label}  (WebP : {webp.relative_to(root)})')
            else:
                print(f'[SUPPRIMABLE] {label}  (WebP : {webp.relative_to(root)})')

    print(f'\nBilan : {removable} doublon(s) {"supprimé(s)" if args.delete else "supprimable(s)"}, '
          f'{blocked} conservé(s) car référencé(s).')
    if args.delete:
        print('Contrôler ensuite : git status --short ; pnpm build:verified')
    else:
        print('Pour supprimer uniquement les doublons non référencés : ajouter --delete')
    print('Note : les références enregistrées dans les mondes Foundry déjà importés ne sont pas inspectées.')


if __name__ == '__main__':
    main()
