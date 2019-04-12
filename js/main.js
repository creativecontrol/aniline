$(function(){
    var config = null;
    var midi_output = null;
    var midi_input = null;
    console.log("internal JS loaded");

    $.getJSON("/js/config.json", function(data){
        console.log(data);
        config = data;
        startContext();
    });

    function startContext() {

        const MIN_NOTE = 48;
        const MAX_NOTE = 84;
        const DEFAULT_BPM = 120;
        const MAX_MIDI_BPM = 240;
        const TEMPO_MIDI_CONTROLLER = 20; // Control changes for tempo for this controller id

        // Using the Improv RNN pretrained model from https://github.com/tensorflow/magenta/tree/master/magenta/models/improv_rnn
        let rnn = new mm.MusicRNN(
          'https://storage.googleapis.com/download.magenta.tensorflow.org/tfjs_checkpoints/music_rnn/chord_pitches_improv'
        );

        // Startup

        setupMIDI();

        let machinePlayer = buildKeyboard(
          document.querySelector('.machine-bg .player')
        );
        let humanPlayer = buildKeyboard(document.querySelector('.human-bg .player'));
        let currentSeed = [];
        let stopCurrentSequenceGenerator;
        let synthsPlaying = {};
        let currentPlayFn;
        let tick = 0;

// pulled from original onActiveOutputChange
        let outputs = {
          config.midi_output: {
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
          }
        };

        let activeOutput = config.midi_output;
//---------------------

        function generateDummySequence() {
          // Generate a throwaway sequence to get the RNN loaded so it doesn't
          // cause jank later.
          return rnn.continueSequence(
            buildNoteSequence([{ note: 60, time: Tone.now() }]),
            20,
            temperature,
            ['Cm']
          );
        }

//         let bufferLoadPromise = new Promise(res => Tone.Buffer.on('load', res));
//         Promise.all([bufferLoadPromise, rnn.initialize()])
//           .then(generateDummySequence)
//           .then(() => {
//             Tone.Transport.start();
//             Tone.Transport.bpm.value = DEFAULT_BPM;
//             onScreenKeyboardContainer.classList.add('loaded');
//             document.querySelector('.loading').remove();
//           });

//         StartAudioContext(Tone.context, document.documentElement);

//     }

    function isAccidental(note) {
      let pc = note % 12;
      return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
    }

    function detectChord(notes) {
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
      let step = 0;
      let delayProb = pulsePattern ? 0 : 0.3;
      let notes = seed.map(n => {
        let dur = 1 + (Math.random() < delayProb ? 1 : 0);
        let note = {
          pitch: n.note,
          quantizedStartStep: step,
          quantizedEndStep: step + dur
        };
        step += dur;
        return note;
      });
      return {
        totalQuantizedSteps: _.last(notes).quantizedEndStep,
        quantizationInfo: {
          stepsPerQuarter: 1
        },
        notes
      };
    }

    function seqToTickArray(seq) {
      return _.flatMap(seq.notes, n =>
        [n.pitch].concat(
          pulsePattern
            ? []
            : _.times(n.quantizedEndStep - n.quantizedStartStep - 1, () => null)
        )
      );
    }

    function doTick(time = Tone.now() - Tone.context.lookAhead) {
      applyHumanKeyChanges(time);
      if (currentPlayFn) currentPlayFn(time);
    }

    function startSequenceGenerator(seed) {
      let running = true,
        thisPatternLength = patternLength;

      let chords = detectChord(seed);
      let chord =
        _.first(chords) ||
        Tonal.Note.pc(Tonal.Note.fromMidi(_.first(seed).note)) + 'M';
      let seedSeq = buildNoteSequence(seed);
      let generatedSequence = seqToTickArray(seedSeq);
      let playIntervalTime = Tone.Time('8n').toSeconds();
      let generationIntervalTime = playIntervalTime / 2;
      function generateNext() {
        if (!running) return;
        if (generatedSequence.length < thisPatternLength) {
          rnn.continueSequence(seedSeq, 20, temperature, [chord]).then(genSeq => {
            generatedSequence = generatedSequence.concat(seqToTickArray(genSeq));
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

      setTimeout(generateNext, 0);

      return () => {
        running = false;
        currentPlayFn = null;
      };
    }

    function updateChord({ add = [], remove = [] }) {
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
      if (currentSeed.length) {
        stopCurrentSequenceGenerator = startSequenceGenerator(
          _.cloneDeep(currentSeed)
        );
      }
    }

    let humanKeyAdds = [],
      humanKeyRemovals = [];
    function humanKeyDown(note, velocity = 0.7) {
      if (note < MIN_NOTE || note > MAX_NOTE) return;
      humanKeyAdds.push({ note, velocity });
    }
    function humanKeyUp(note) {
      if (note < MIN_NOTE || note > MAX_NOTE) return;
      humanKeyRemovals.push({ note });
    }
    function applyHumanKeyChanges(time = Tone.now()) {
      if (humanKeyAdds.length == 0 && humanKeyRemovals.length == 0) return;
      for (let { note, velocity } of humanKeyAdds) {
        outputs[activeOutput].play(note, velocity, time, true);
        humanPlayer[note - MIN_NOTE].classList.add('down');
        animatePlay(onScreenKeyboard[note - MIN_NOTE], note, true);
      }
      for (let { note } of humanKeyRemovals) {
        outputs[activeOutput].stop(note, time);
        humanPlayer[note - MIN_NOTE].classList.remove('down');
      }
      updateChord({
        add: humanKeyAdds.map(n => n.note),
        remove: humanKeyRemovals.map(n => n.note)
      });
      humanKeyAdds.length = 0;
      humanKeyRemovals.length = 0;
    }

    function machineKeyDown(note, time) {
      if (note < MIN_NOTE || note > MAX_NOTE) return;
      outputs[activeOutput].play(note, 0.7, time);
      // animatePlay(onScreenKeyboard[note - MIN_NOTE], note, false);
      // animateMachine(machinePlayer[note - MIN_NOTE]);
    }

    function setupMIDI(){
        // MIDI setup

        WebMidi.enable(err => {
          if (err) {
            // using more extensive error messaging to pass back to NodeJS
            console.error('WebMidi could not be enabled', err.name, err.message);
            return;
          }
          console.log('WebMidi loaded successfully');
          midi_input = WebMidi.inputs[0];
          midi_output = WebMidi.outputs[0];

          if (midi_input) {
            midi_input.addListener('noteon', 1, e => {
              humanKeyDown(e.note.number, e.velocity);
              //hideUI();
            });
            midi_input.addListener('controlchange', 1, e => {
              if (e.controller.number === TEMPO_MIDI_CONTROLLER) {
                Tone.Transport.bpm.value = (e.value / 128) * MAX_MIDI_BPM;
                echo.delayTime.value = Tone.Time('8n.').toSeconds();
              }
            });
            midi_input.addListener('noteoff', 1, e => humanKeyUp(e.note.number));
            // for (let option of Array.from(inputSelector.children)) {
            //   option.selected = option.value === id;
            // }
            // activeInput = input;
          }

        })
    }

    Promise.all([rnn.initialize()])
           .then(generateDummySequence)
           .then(() => {
             Tone.Transport.start();
             Tone.Transport.bpm.value = DEFAULT_BPM;
           });

   StartAudioContext(Tone.context, document.documentElement);

})

// document.querySelector('#play').addEventListener('click', function() {
//     Tone.Transport.bpm.value = 80;
//     Tone.Transport.start();
// });

// var seq = new Tone.Sequence(function(time, note){
// console.log(note);
// //straight quater notes
// }, ["C4", "E4", "G4", "A4"], "4n");
// seq.loop = true;
// seq.start();
