# Pinch

This was a quick little experiment to see how well Javascript could compress if its
AST was serialized into a compact binary form.

Tested on React DOM, minified.

The un-compressed (no Gzip nor Brotli) results were pretty good - about 28% less than
the original.

However, Gzip and Brotli compression performed _worse_ than on the original, to nobody's
surprise.

This wasn't a super serious or scientific test, I just wanted to see what would happen.

Final results (`.p.js` extension is the "pinched" version):

```
120585 react.js
 34550 react.js.br
 39617 react.js.z
 88257 react.p.js
 37335 react.p.js.br
 43357 react.p.js.z
```

Released into the Public Domain or CC0 or MIT, whichever one floats your boat.
