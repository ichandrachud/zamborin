# sheet.py out.png w h files... : side by side, each scaled to w x h
import sys
from PIL import Image
out, w, h = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]); fs = sys.argv[4:]
W = Image.new('RGB', (len(fs) * (w + 10) - 10, h), 'white')
for i, f in enumerate(fs): W.paste(Image.open(f).convert('RGB').resize((w, h)), (i * (w + 10), 0))
W.save(out)
