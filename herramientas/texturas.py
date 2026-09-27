import json, urllib.request, os, sys
names = ['concrete_floor_worn_001','painted_concrete','dark_wooden_planks','metal_plate','leather_red_02','dirty_carpet','black_painted_planks']
os.makedirs('public/tex', exist_ok=True)
for n in names:
    try:
        d = json.load(urllib.request.urlopen(f'https://api.polyhaven.com/files/{n}'))
        for key, short in [('Diffuse','diff'),('nor_gl','nor'),('Rough','rough')]:
            if key not in d: 
                print('falta', n, key); continue
            url = d[key]['1k']['jpg']['url']
            out = f'public/tex/{n}_{short}.jpg'
            urllib.request.urlretrieve(url, out)
        print('ok', n)
    except Exception as e:
        print('ERR', n, e)
