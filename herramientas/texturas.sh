#!/bin/zsh
# Descarga texturas PBR CC0 de Poly Haven (1K) a public/tex
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
mkdir -p public/tex
for n in concrete_floor_worn_001 painted_concrete dark_wooden_planks metal_plate leather_red_02 dirty_carpet black_painted_planks brushed_concrete fabric_leather_02 rubber_tiles; do
  for m in diff:diff nor_gl:nor rough:rough; do
    k=${m%%:*}; s=${m##*:}
    curl -sSf -A "$UA" -o public/tex/${n}_${s}.jpg "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/${n}/${n}_${k}_1k.jpg" || echo "fallo $n $k"
  done
  echo ok $n
done
