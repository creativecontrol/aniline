/*
* Magenta Improvisor
*
* Requires: ToneJS, TonalJS, MagentaJS, LodashJS
*
* Returns improvised melody, bass note, and melody array
*
* To use:
* -- Create new instance
*
* let imp = Improvisor({
* neuralNet: rnn...
* etc.
* });
*
* -- inputNotes to get info outputs
* imp.inputNotes()
*/

var Improvisor = function ({
  key = 'CM',
  tempo = 120,
  temperature = 1.1,
  neuralNet,
  improvOut,
  improvChannel,
  bassOut,
  bassChannel,
  leadOut,
  leadChannel,
  parent

} = {}) {
  let self = this;

  self.MIN_NOTE = 30;
  self.MAX_NOTE = 84;
  self.LEAD_NOTES = -3; // TODO: this should come from the calling config
  self.WAIT_TIME = 1000;

  self.key = key;
  self.tempo = tempo;
  self.temperature = temperature;
  self.neuralNet = neuralNet;
  self.improvOut = improvOut;
  self.improvChannel = improvChannel;
  self.bassOut = bassOut;
  self.bassChannel = bassChannel;
  self.leadOut = leadOut;
  self.leadChannel = leadChannel;
  self.parent = parent;
  console.warn(parent);

  self.currentSeed = [];
  self.stopCurrentSequenceGenerator = '';
  self.leadSet = '';
  self.tonicLast = '';
  self.tonicM = '';

  self.loadNeuralNet();
  self.init();
};

Improvisor.prototype.init = function () {
  let self = this;

  Promise.all([self.neuralNet.initialize()])
    .then(() => {
      console.info('Initialized MusicRNN');
    })
    .then(self.generateDummySequence());
};

Improvisor.prototype.loadNeuralNet = function () {
  let self = this;

  try {
    self.neuralNet = new mm.MusicRNN(self.neuralNet);
  } catch (err) {
    console.warn(err.message);
  }
};

Improvisor.prototype.getSeedIntervals = function (seed) {
  let intervals = [];
  for (let i = 0; i < seed.length - 1; i++) {
    let rawInterval = seed[i + 1].time - seed[i].time;
    // let measure = _.minBy(['8n', '4n'], subdiv =>
    let measure = _.minBy(['8n', '4n', '2n'], subdiv =>
      Math.abs(rawInterval - Tone.Time(subdiv).toSeconds())
    );
    intervals.push(Tone.Time(measure).toSeconds());
  }
  return intervals;
};

Improvisor.prototype.getSequenceLaunchWaitTime = function (seed) {
  let self = this;

  if (seed.length <= 1) {
    return 1;
  }
  let intervals = self.getSeedIntervals(seed);
  let maxInterval = _.max(intervals);
  return maxInterval * 2;
};

Improvisor.prototype.getSequencePlayIntervalTime = function (seed) {
  let self = this;
  if (seed.length <= 1) {
    return Tone.Time('8n').toSeconds();
  }
  let intervals = self.getSeedIntervals(seed).sort();
  return _.first(intervals);
};

Improvisor.prototype.detectChord = function (notes) {
  notes = notes.map(n => Tonal.Note.pc(Tonal.Note.fromMidi(n.note))).sort();
  return Tonal.PcSet.modes(notes)
    .map((mode, i) => {
      const tonic = Tonal.Note.name(notes[i]);
      const names = Tonal.Dictionary.chord.names(mode);
      return names.length ? tonic + names[0] : null;
    })
    .filter(x => x);
};

Improvisor.prototype.buildNoteSequence = function (seed) {
  let self = this;

  // pull the lowest note as the tonic of the sequence
  self.tonicM = seed[0].note;

  // pull the top three notes as the lead line
  self.leadSet = seed.slice(self.LEAD_NOTES).map(kernel => kernel.note);
  // Set the leadNote array in the parent object. Need a better way to call this (more generic).
  self.parent.leadSet = self.leadSet;

  return mm.sequences.quantizeNoteSequence(
    {
      ticksPerQuarter: 220,
      totalTime: seed.length * 0.5,
      quantizationInfo: {
        stepsPerQuarter: 1
      },
      timeSignatures: [
        { // TODO : do these need to be vars or args
          time: 0,
          numerator: 4,
          denominator: 4
        }
      ],
      tempos: [
        {
          time: 0,
          qpm: self.tempo
        }
      ],
      notes: seed.map((n, idx) => ({
        pitch: n.note,
        startTime: idx * 0.5,
        endTime: (idx + 1) * 0.5
      }))
    },
    1
  );
};

Improvisor.prototype.startSequenceGenerator = function (seed) {
  let self = this;

  // console.warn('sequence generator ping');

  let running = true;
  let lastGenerationTask = Promise.resolve();

  let chords = self.detectChord(seed);
  let chord = _.first(chords) || self.key;
  let seedSeq = self.buildNoteSequence(seed);
  let generatedSequence =
    Math.random() < 0.7 ? _.clone(seedSeq.notes.map(n => n.pitch)) : [];
  let launchWaitTime = self.getSequenceLaunchWaitTime(seed);
  let playIntervalTime = self.getSequencePlayIntervalTime(seed);
  let generationIntervalTime = playIntervalTime / 2;

  function generateNext () {
    // console.warn('generate next');
    if (!running) return;
    if (generatedSequence.length < 10) {
      lastGenerationTask = self.neuralNet
        .continueSequence(seedSeq, 20, self.temperature, [chord])
        .then(genSeq => {
          generatedSequence = generatedSequence.concat(
            genSeq.notes.map(n => n.pitch)
          );
          setTimeout(generateNext, generationIntervalTime * self.WAIT_TIME);
        });
    } else {
      setTimeout(generateNext, generationIntervalTime * self.WAIT_TIME);
    }
  }

  function consumeNext (time) {
    // console.warn('consume next');
    if (generatedSequence.length) {
      let note = generatedSequence.shift();
      if (note > 0) {
        self.playNotes(note, time);
        // console.warn('playing improv notes');
      }
    }
  }

  setTimeout(generateNext, launchWaitTime * self.WAIT_TIME);
  let consumerId = Tone.Transport.scheduleRepeat(
    consumeNext,
    playIntervalTime,
    Tone.Transport.seconds + launchWaitTime
  );

  return () => {
    running = false;
    Tone.Transport.clear(consumerId);
  };
};

Improvisor.prototype.updateChord = function ({ add = null, remove = null }) {
  let self = this;

  if (add) {
    if (Array.isArray(add)) {
      let now = Tone.now();
      add.forEach((addNote) => {
        let noteNumber = addNote;
        if (!Number.isInteger(addNote)) {
          noteNumber = Tone.Frequency(addNote).toMidi();
        }
        self.currentSeed.push({ note: noteNumber, time: now });
      });
    } else {
      self.currentSeed.push({ note: add, time: Tone.now() });
    }
  }
  // if (remove && _.some(self.currentSeed, { note: remove })) {
  if (remove) {
    if (Array.isArray(remove)) {
      remove.forEach((removeNote) => {
        let noteNumber = removeNote;
        if (!Number.isInteger(removeNote)) {
          noteNumber = Tone.Frequency(removeNote).toMidi();
        }
        _.remove(self.currentSeed, { note: noteNumber })
      });
    } else {
      _.remove(self.currentSeed, { note: remove });
    }
  }

  if (self.stopCurrentSequenceGenerator) {
    self.stopCurrentSequenceGenerator();
    self.stopCurrentSequenceGenerator = null;
  }
  if (self.currentSeed.length && !self.stopCurrentSequenceGenerator) {
    // resetState = true;
    self.stopCurrentSequenceGenerator = self.startSequenceGenerator(
      _.cloneDeep(self.currentSeed)
    );
  }
};

// this is where the list of notes is updated with each note event
// called from the MIDI listener on note input in the original
// was called humanKeyDown
Improvisor.prototype.inputNote = function (note, velocity = 0.7) {
  let self = this;

  if (note < self.MIN_NOTE || note > self.MAX_NOTE) return;
  self.updateChord({ add: note });
};

// remove note from chord
// was called humanKeyUp
Improvisor.prototype.removeNote = function (note) {
  let self = this;

  if (note < self.MIN_NOTE || note > self.MAX_NOTE) return;
  // NOTE: may not need to stop notes since I'm giving them a duration in playNotes
  // this.improvOut.stopNote('all', self.improvChannel);
  // this.bassOut.stopNote('all', self.improvChannel);
  // this.leadOut.stopNote('all', self.improvChannel);
  self.updateChord({ remove: note });

  // reset the bassline
  self.tonicLast = 0;
};

// start playing
// was called machineKeyDown
Improvisor.prototype.playNotes = function (note, time) {
  let self = this;

  if (note < self.MIN_NOTE || note > self.MAX_NOTE) return;
  // TODO : figure out how to pass note events back to the thing calling this.
  self.midiToParent(note, self.improvChannel, 500);
  // console.warn('sending improv note out');
  // console.warn(note);
  //  m_out.playNote(note, 1, {duration: 500});

  // send out the bass note
  if (self.tonicM !== self.tonicLast) {
    // TODO: change bass duration to a variable
    self.midiToParent(self.dropOctave(self.tonicM), self.bassChannel, 1250);

    // TODO: activate this via sensor input
    // self.midiToParent(self.leadSet[Math.floor(Math.random() * self.leadSet.length)], self.leadChannel, 1500);

    self.tonicLast = self.tonicM;
  }
};

Improvisor.prototype.dropOctave = function (originalNote) {
  return originalNote - 12;
};

Improvisor.prototype.generateDummySequence = function () {
  let self = this;
  // Generate a throwaway sequence to get the RNN loaded so it doesn't
  // cause jank later.

  return self.neuralNet.continueSequence(
    self.buildNoteSequence([{ note: 60, time: Tone.now() }]),
    20,
    self.temperature,
    ['CM']
  );
};

Improvisor.prototype.midiToParent = function (note, channel, duration) {
  let self = this;

  self.parent.improvEvents(note, channel, duration);
};
