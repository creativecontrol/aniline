# aniline
Aniline implements Magenta improvisation algorithms through the JS Web context.
The intent is to run this on an UP Board.
This is done by running Puppeteer to control a Chromium browser. The GPU is
required for Magenta optimization. Currently it seems like the GPU context cannot
be run at the command line (even though there are supposed settings for this).
Python and directly running Magenta in NodeJS were potential options but these
were not deemed feasible.
Python requires the entire installation of Magenta and the current tools are not
built for real-time interaction in the way that the JS library is.
NodeJS (using TypeScript) has issues finding the WebMidi context required for
MagentaJS to be used in a purely NodeJS context.

The first "instrument" or process to be implemented is a port of Tero Parivianen's
Neural Arpeggiator https://codepen.io/teropa/pen/ddqEwj

The second will be an Improvisor based on the Redwood Trail project.

TODO:
- see if multiple instances can run at the same time (for two player input use)
- or see if the code can be modified to support two controllers
- add support for Teensy USB/MIDI instruments for output
- add support for dual Teensy output to allow for more than 4 output channels (using Ornament and Crimes)
- try with the Dodeca https://synthcube.com/cart/magpie-dodeca-spicy-version for more MIDI outputs
