/*
* Aniline Arpeggiator.
*/
$(function () {
  var config = null;
  var midiOutput = null;
  var midiInput = null;
  var settingPageVisible = false;

  let version = '0.1.0';
  $('.version').text('v.' + version);

  console.log('internal JS loaded');

  $('#settings-icon').click(function () {
    $('#main-page').toggle();
    $('#settings-controls').toggle();
  });

  function startContext () {

    const MIN_NOTE = 30;
    const MAX_NOTE = 84;
    const DEFAULT_BPM = 120;
    const WAIT_TIME = 1000;
    const LEAD_NOTES = -3;
    const MIDI_CHANNELS = 16;

    let temperature = 1.1;
    let patternLength = 8;
    let thisPatternLength = 16;
    let density = 90.0;
    let root = 'C';
    let mode = 'major'

    // Using the Improv RNN pretrained model from https://github.com/tensorflow/magenta/tree/master/magenta/models/improv_rnn
    // let rnn = new mm.MusicRNN('./magenta/chord_pitches_improv');
    let rnn = new mm.MusicRNN(
      'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/chord_pitches_improv'
    );

    let currentSeed = [];
    let stopCurrentSequenceGenerator;
    let pulsePattern = true;
    let currentPlayFn;
    let tick = 0;
    let midiClockIconOnTicks = 5;
    let leadSet = '';
    let tonicLast = '';
    let tonicM = '';

    // Temperature control
    let tempSlider = new mdc.slider.MDCSlider(
      document.querySelector('#temperature')
    );
    tempSlider.listen('MDCSlider:change', () => (temperature = tempSlider.value));

    // Density control
    let densitySlider = new mdc.slider.MDCSlider(
      document.querySelector('#density')
    );
    densitySlider.listen('MDCSlider:change', () => (density = densitySlider.value));

    // // Root select
    // let rootSelector = document.querySelector('#root');
    // rootSelector.addEventListener('change', evt => (root = evt.target.value));
    //
    //   // Mode select
    //   let modeSelector = document.querySelector('#mode');
    //   modeSelector.addEventListener('change', evt => (mode = evt.target.value));
    //   for(let scale of Tonal.Dictionary.scale.names()){
    //       option = document.createElement('option');
    //       option.value = scale;
    //       option.innerText = scale;
    //       modeSelector.appendChild(option);
    //   }

    let outputs = {
      internal: {
        play: (note, velocity, time, hold = false) => {
        },
        stop: (note, time) => {
        }
      }
    };
    let activeOutput = 'internal';

    function getSeedIntervals(seed) {
      let intervals = [];
      for (let i = 0; i < seed.length - 1; i++) {
        let rawInterval = seed[i + 1].time - seed[i].time;
        let measure = _.minBy(['8n', '4n'], subdiv =>
          Math.abs(rawInterval - Tone.Time(subdiv).toSeconds())
        );
        intervals.push(Tone.Time(measure).toSeconds());
      }
      return intervals;
    }

    function getSequenceLaunchWaitTime(seed) {
      if (seed.length <= 1) {
        return 1;
      }
      let intervals = getSeedIntervals(seed);
      let maxInterval = _.max(intervals);
      return maxInterval * 2;
    }

    function getSequencePlayIntervalTime(seed) {
      if (seed.length <= 1) {
        return Tone.Time('8n').toSeconds();
      }
      let intervals = getSeedIntervals(seed).sort();
      return _.first(intervals);
    }

    function isAccidental (note) {
      let pc = note % 12;
      return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
    }

    function detectChord (notes) {
      notes = notes.map(n => Tonal.Note.pc(Tonal.Note.fromMidi(n.note))).sort();
      return Tonal.PcSet.modes(notes)
        .map((mode, i) => {
          const tonic = Tonal.Note.name(notes[i]);
          const names = Tonal.Dictionary.chord.names(mode);
          return names.length ? tonic + names[0] : null;
        })
        .filter(x => x);
    }

    function buildNoteSequence(seed) {
      return mm.sequences.quantizeNoteSequence(
        {
          ticksPerQuarter: 220,
          totalTime: seed.length * 0.5,
          quantizationInfo: {
            stepsPerQuarter: 1
          },
          timeSignatures: [
            {
              time: 0,
              numerator: 4,
              denominator: 4
            }
          ],
          tempos: [
            {
              time: 0,
              qpm: 120
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
    }

    function doTick (time = Tone.now() - Tone.context.lookAhead) {
      applyHumanKeyChanges(time);
      if (currentPlayFn) currentPlayFn(time);
    }

    function startSequenceGenerator (seed) {
      let running = true;
      let lastGenerationTask = Promise.resolve();
      let chords = detectChord(seed);
      let chord =
        _.first(chords) ||
        Tonal.Note.pc(Tonal.Note.fromMidi(_.first(seed).note)) + 'M';
      let seedSeq = buildNoteSequence(seed);
      let generatedSequence =
        Math.random() < 0.7 ? _.clone(seedSeq.notes.map(n => n.pitch)) : [];
      let launchWaitTime = getSequenceLaunchWaitTime(seed);
      let playIntervalTime = getSequencePlayIntervalTime(seed);
      let generationIntervalTime = playIntervalTime / 2;
      function generateNext () {
        if (!running) return;
        // if (generatedSequence.length < 10) {
        //    lastGenerationTask = rnn
        //     .continueSequence(seedSeq, 20, temperature, [chord])
        //     .then(genSeq => {
        //       generatedSequence = generatedSequence.concat(
        //         genSeq.notes.map(n => n.pitch)
        //       );
        //       setTimeout(generateNext, generationIntervalTime * 1000);
        //     });
        // } else {
        //   setTimeout(generateNext, generationIntervalTime * 1000);
        // }
      // TODO: Descide if we should do this based on clock (probably yes)
        if (generatedSequence.length < 10) {
            lastGenerationTask = rnn
            .continueSequence(seedSeq, 20, temperature, [chord]).then(genSeq => {
            generatedSequence = generatedSequence.concat( genSeq.notes.map(n => n.pitch));
            setTimeout(generateNext, generationIntervalTime * 1000);
          });
        }
      }

      tick = 0;
      currentPlayFn = function playNext(time) {
        let tickInSeq = tick % thisPatternLength;
        if (tickInSeq < generatedSequence.length) {
          let note = generatedSequence[tickInSeq];
          if (note) machineKeyDown(note, time);
        }
        tick++;
      };

    function consumeNext(time) {
      if (generatedSequence.length) {
        let note = generatedSequence.shift();
        if (note > 0) {
          machineKeyDown(note, time);
        }
      }
    }

    // setTimeout(generateNext, launchWaitTime * 1000);
    setTimeout(generateNext, 0);
    // let consumerId = Tone.Transport.scheduleRepeat(
    //   consumeNext,
    //   playIntervalTime,
    //   Tone.Transport.seconds + launchWaitTime
    // );

    return () => {
      running = false;
      currentPlayFn = null;
      // Tone.Transport.clear(consumerId);
    };
  }

    function updateChord ({ add = [], remove = [] }) {
      for (let note of add) {
        currentSeed.push({ note, time: Tone.now() });
      }
      for (let note of remove) {
        _.remove(currentSeed, { note });
      }

      if (stopCurrentSequenceGenerator) {
        stopCurrentSequenceGenerator();
        stopCurrentSequenceGenerator = null;
      }
      if (currentSeed.length && !stopCurrentSequenceGenerator) {
        resetState = true;
        stopCurrentSequenceGenerator = startSequenceGenerator(
          _.cloneDeep(currentSeed)
        );
      }
    }

    let humanKeyAdds = [];
    let humanKeyRemovals = [];

    function humanKeyDown (note, velocity = 0.7) {
      console.debug('key down ' + note);
      if (note < MIN_NOTE || note > MAX_NOTE) return;
      humanKeyAdds.push({ note, velocity });
    }
    function humanKeyUp (note) {
      console.debug('key up ' + note);
      if (note < MIN_NOTE || note > MAX_NOTE) return;
      humanKeyRemovals.push({ note });
    }
    function applyHumanKeyChanges (time = Tone.now()) {
      if (humanKeyAdds.length === 0 && humanKeyRemovals.length === 0) return;
      for (let { note, velocity } of humanKeyAdds) {
        console.debug('play output ' + note + ' ' + time);
        outputs[activeOutput].play(note, velocity, time, true);
      }
      for (let { note } of humanKeyRemovals) {
        console.debug('stop output ' + note + ' ' + time);
        outputs[activeOutput].stop(note, time);
        // humanPlayer[note - MIN_NOTE].classList.remove('down');
      }
      updateChord({
        add: humanKeyAdds.map(n => n.note),
        remove: humanKeyRemovals.map(n => n.note)
      });
      humanKeyAdds.length = 0;
      humanKeyRemovals.length = 0;
    }

    function setDensity (vel) {
      let rand = Math.random();
      return (rand <= density * 0.01) ? vel : 0;
    }

    function machineKeyDown (note, time) {
      if (note < MIN_NOTE || note > MAX_NOTE) return;
      console.debug('play output ' + note + ' ' + time);
      let velocityDensity = setDensity(0.7);
      console.debug('vel den: ' + velocityDensity);
      outputs[activeOutput].play(note, velocityDensity, time);
    }

    function generateDummySequence () {
      console.log('dummy sequence generating');
      // Generate a throwaway sequence to get the RNN loaded so it doesn't
      // cause jank later.
      return rnn.continueSequence(
        buildNoteSequence([{ note: 60, time: Tone.now() }]),
        20,
        temperature,
        ['Cm']
      );
    }

    function setupMIDI () {
      WebMidi.enable(err => {
        if (err) {
          // using more extensive error messaging to pass back to NodeJS
          console.error('WebMidi could not be enabled', err.name, err.message);
          return;
        }
        console.log('WebMidi loaded successfully');
        console.debug(WebMidi.inputs);
        console.debug(WebMidi.outputs);

        let inputSelector = document.querySelector('#midi-inputs');
        let outputSelector = document.querySelector('#outputs');
        let clockInputSelector = document.querySelector('#midi-clock-inputs');
        let improvChannelSelector = document.querySelector('#improv-channel');
        let bassChannelSelector = document.querySelector('#bass-channel');
        let leadChannelSelector = document.querySelector('#lead-channel');
        let activeInput,
          activeClockInputId,
          activeClockOutputId,
          transportTickerId,
          clockOutputTickerId,
          midiTickCount,
          lastBeatAt;

        function * range (start, end) {
          for (let i = start; i <= end; i++) {
            yield i;
          }
        }

        function fillChannels (selector) {
          for (let i of range(1, MIDI_CHANNELS)) {
            let option = document.createElement('option');
            option.value = i;
            option.innerText = _.padStart(i, 2, '0');
            selector.appendChild(option);
          }
        }

        fillChannels(improvChannelSelector);
        fillChannels(bassChannelSelector);
        fillChannels(leadChannelSelector);

        function onInputsChange () {
          if (WebMidi.inputs.length === 0) {
            onActiveInputChange(null);
          } else {
            while (inputSelector.firstChild) {
              inputSelector.firstChild.remove();
            }
            for (let input of WebMidi.inputs) {
              let option = document.createElement('option');
              option.value = input.id;
              option.innerText = input.name;
              inputSelector.appendChild(option);
            }
            onActiveInputChange(WebMidi.inputs[0].id);
          }
        }

        function onOutputsChange () {
          while (outputSelector.firstChild) {
            outputSelector.firstChild.remove();
          }
          for (let output of WebMidi.outputs) {
            let option = document.createElement('option');
            option.value = output.id;
            option.innerText = output.name;
            outputSelector.appendChild(option);
          }
          onActiveOutputChange(WebMidi.outputs[0].id);
        }

        function onClockInputsChange () {
          if (WebMidi.inputs.length === 0) {
            onActiveClockInputChange('none');
          } else {
            while (clockInputSelector.firstChild) {
              clockInputSelector.firstChild.remove();
            }
            let option = document.createElement('option');
            option.value = 'none';
            option.innerText = 'None (internal clock)';
            clockInputSelector.appendChild(option);

            for (let input of WebMidi.inputs) {
              option = document.createElement('option');
              option.value = input.id;
              option.innerText = input.name;
              clockInputSelector.appendChild(option);
            }
            onActiveClockInputChange(WebMidi.inputs[0].id);
          }
        }

        function onActiveInputChange (id) {
          if (activeInput) {
            activeInput.removeListener();
          }
          let input = WebMidi.getInputById(id);
          if (input) {
            input.addListener('noteon', 1, e => {
              humanKeyDown(e.note.number, e.velocity);
            });
            input.addListener('controlchange', 1, e => {
              if (e.controller.number === TEMPO_MIDI_CONTROLLER) {
                Tone.Transport.bpm.value = (e.value / 128) * MAX_MIDI_BPM;
              }
            });
            input.addListener('noteoff', 1, e => humanKeyUp(e.note.number));
            for (let option of Array.from(inputSelector.children)) {
              option.selected = option.value === id;
            }
            activeInput = input;
          }
        }

        function onActiveOutputChange (id) {
          if (activeOutput !== 'internal') {
            outputs[activeOutput] = null;
          }
          activeOutput = id;
          if (activeOutput !== 'internal') {
            let output = WebMidi.getOutputById(id);
            outputs[id] = {
              play: (note, velocity = 1, time, hold = false) => {
                if (!hold) {
                  let delay = (time - Tone.now()) * 1000;
                  let duration = Tone.Time('16n').toMilliseconds();
                  output.playNote(note, 'all', {
                    time: delay > 0 ? `+${delay}` : WebMidi.now,
                    velocity,
                    duration
                  });
                }
              },
              stop: (note, time) => {
                let delay = (time - Tone.now()) * 1000;
                output.stopNote(note, 2, {
                  time: delay > 0 ? `+${delay}` : WebMidi.now
                });
              }
            };
          }
          for (let option of Array.from(outputSelector.children)) {
            option.selected = option.value === id;
          }
        }

        function startClockOutput () {
          let output = WebMidi.getOutputById(activeClockOutputId);
          clockOutputTickerId = Tone.Transport.scheduleRepeat(time => {
            let startDelay = time - Tone.context.currentTime;
            let quarter = Tone.Time('4n').toSeconds();
            for (let i = 0; i < 24; i++) {
              let tickDelay = startDelay + (quarter / 24) * i;
              output.sendClock({ time: `+${tickDelay * 1000}` });
            }
          }, '4n');
        }

        function stopClockOutput () {
          Tone.Transport.clear(clockOutputTickerId);
        }

        function incomingMidiClockStart () {
          midiTickCount = 0;
          tick = 0;
        }

        function incomingMidiClockStop () {
          midiTickCount = 0;
          applyHumanKeyChanges();
        }

        function incomingMidiClockTick (evt) {
          if (midiTickCount % 24 === 0) {
            if (lastBeatAt) {
              let beatDur = evt.timestamp - lastBeatAt;
              Tone.Transport.bpm.value = Math.round(60000 / beatDur);
            }
            lastBeatAt = evt.timestamp;
            $('#clock').toggleClass("on");
          }
          if (midiTickCount % 24 === midiClockIconOnTicks) {
            $('#clock').toggleClass("on");
          }
          if (midiTickCount % 12 === 0) {
            doTick();
          }
          midiTickCount++;
        }

        function onActiveClockInputChange (id) {
          if (activeClockInputId === 'none') {
            Tone.Transport.clear(transportTickerId);
            transportTickerId = null;
          } else if (activeClockInputId) {
            let input = WebMidi.getInputById(activeClockInputId);
            input.removeListener('start', 'all', incomingMidiClockStart);
            input.removeListener('stop', 'all', incomingMidiClockStop);
            input.removeListener('clock', 'all', incomingMidiClockTick);
          }
          activeClockInputId = id;
          if (activeClockInputId === 'none') {
            transportTickerId = Tone.Transport.scheduleRepeat(doTick, '8n');
            Tone.Transport.bpm.value = DEFAULT_BPM;
            // echo.delayTime.value = Tone.Time('8n.').toSeconds();
          } else {
            let input = WebMidi.getInputById(id);
            input.addListener('start', 'all', incomingMidiClockStart);
            input.addListener('stop', 'all', incomingMidiClockStop);
            input.addListener('clock', 'all', incomingMidiClockTick);
            midiTickCount = 0;
          }
          for (let option of Array.from(clockInputSelector.children)) {
            option.selected = option.value === id;
          }
        }

        onInputsChange();
        onOutputsChange();
        onClockInputsChange();

        WebMidi.addListener(
          'connected',
          () => (
            onInputsChange(),
            onOutputsChange(),
            onClockInputsChange()
          )
        );
        WebMidi.addListener(
          'disconnected',
          () => (
            onInputsChange(),
            onOutputsChange(),
            onClockInputsChange()
          )
        );
        inputSelector.addEventListener('change', evt =>
          onActiveInputChange(evt.target.value)
        );
        outputSelector.addEventListener('change', evt =>
          onActiveOutputChange(evt.target.value)
        );
        clockInputSelector.addEventListener('change', evt =>
          onActiveClockInputChange(evt.target.value)
        );
      });
    }

    // Startup
    setupMIDI();
    Promise.all([rnn.initialize()])
      .then(generateDummySequence)
      .then(() => {
        Tone.Transport.start();
        Tone.Transport.bpm.value = DEFAULT_BPM;
      });

    StartAudioContext(Tone.context, document.documentElement);
  }

  startContext();
});
