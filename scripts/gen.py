import os, sys, base64

pages_dir = 'frontend/src/pages'
os.makedirs(pages_dir, exist_ok=True)

def w(name, b64):
    data = base64.b64decode(b64).decode('utf-8')
    path = os.path.join(pages_dir, name)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(data)
    print(f'  Created {name}: {len(data)} chars')

print('Creating NEXA Wallet pages...')
target = sys.argv[1] if len(sys.argv) > 1 else 'all'

# Encode all page contents as base64 (built-in to avoid quoting issues)
pages = {
}

if target == 'all' or target == 'Analytics':
    pages['Analytics.jsx'] = ''

for name, b64 in pages.items():
    w(name, b64)

print('Done.')
