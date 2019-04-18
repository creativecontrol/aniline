# aniline

<img src="https://raw.githubusercontent.com/creativecontrol/aniline/master/aniline_arpeggiator_main.png" width="300px"><img src="https://raw.githubusercontent.com/creativecontrol/aniline/master/aniline_arpeggiator_settings.png" width="300px">

Aniline implements [Magenta](https://magenta.tensorflow.org/) Machine Learning music algorithms using MagentaJS and Electron.
The currently available [Magenta Studio](https://magenta.tensorflow.org/studio) Electron apps from the Magenta team are not real-time.
This is an effort to make the Magenta processes available for real-time performance use.

### Aniline Arpeggiator
A port of Tero Parivianen's [Neural Arpeggiator](https://codepen.io/teropa/pen/ddqEwj) with some additional features.

### Aniline Improviser *\*coming soon\**
A port of Tero Parivianens's [Neural Melody Autocompletion](https://codepen.io/teropa/pen/gvwwZL) with some additional features.

*Note: this project currently depends on some web libraries and thus needs a network connection to run properly.*

## INSTALLATION
- install NodeJS and NPM
- git clone this repo
- cd aniline
- npm install

## BUILD
*coming soon*


## TODO:
- move all libraries to local folders so there is no dependence on the network
- see if multiple instances can run at the same time (for two player input use)
- try with the Dodeca https://synthcube.com/cart/magpie-dodeca-spicy-version for more MIDI outputs in Eurorack modular
- add presets to save i/o settings and parameters
- add a second settings page for connecting controls to MIDI CCs
