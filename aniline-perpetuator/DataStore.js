// DataStore.js

const Store = require('electron-store');

class DataStore extends Store {
  constructor (settings) {
    super(settings);
    this.prefs = this.get('prefs') || [];
  }

  savePrefs (preferences) {
    this.prefs = preferences
    this.set('prefs', this.prefs);
    return this;
  }

  getPrefs () {
    this.prefs = this.get('prefs') || [];
    return this;
  }
}

module.exports = DataStore;
