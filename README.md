# aniline

<img src="https://raw.githubusercontent.com/creativecontrol/aniline/master/aniline-arpeggiator/aniline_arpeggiator_main.png" width="300px"><img src="https://raw.githubusercontent.com/creativecontrol/aniline/master/aniline-improvisor/aniline_improvisor_main.png" width="300px">

Aniline is a set of standalone, cross-platform apps that implement [Magenta](https://magenta.tensorflow.org/) Machine Learning music algorithms using MagentaJS and Electron.
The currently available [Magenta Studio](https://magenta.tensorflow.org/studio) Electron apps from the Magenta team are not real-time.
This is an effort to make the Magenta processes available for real-time performance use. Musical data and control is implemented in MIDI, allowing the processes to be inserted into most electronic music performance setups.

### Aniline Arpeggiator
A port of Tero Parivianen's [Neural Arpeggiator](https://codepen.io/teropa/pen/ddqEwj) with some additional features.

### Aniline Improviser *\*coming soon\**
A port of Tero Parivianens's [Neural Melody Autocompletion](https://codepen.io/teropa/pen/gvwwZL) with some additional features.

*Note: this project currently depends on some web libraries and thus needs a network connection to run properly.*

## INSTALLATION
- install NodeJS and NPM
- git clone this repo
- cd aniline/<name of instrument>
- npm install
- npm start

## BUILD
Aniline use electron-builder to build Native Apps from the Electron code. To generate the app for your platform:
- cd aniline/<name of instrument>
- npm run dist
- cd dist
- install the App from the dmg, deb, or exe

## PERFORM
*coming soon*

## TODO:
- include a properly link Magenta models to remove dependance on network connection
- create user documentation
- <del>move all libraries to local folders so there is no dependence on the network</del> - COMPLETE
- <del>see if multiple instances can run at the same time (for two player input use)</del> - COMPLETE
- <del>try with the Dodeca https://synthcube.com/cart/magpie-dodeca-spicy-version for more MIDI outputs in Eurorack modular</del> - COMPLETE
- <del>add presets to save i/o settings and parameters</del> - COMPLETE
- <del>add a second settings page for connecting controls to MIDI CCs</del> - COMPLETE
