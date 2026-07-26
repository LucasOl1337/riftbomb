"use strict";

    class MusicEngine {
      constructor() {
        this.ctx = null;
        this.master = null;
        this.musicBus = null;
        this.sfxBus = null;
        this.reverb = null;
        this.reverbTone = null;
        this.reverbGain = null;
        this.musicLevel = 0.72;
        this.compressor = null;
        this.analyser = null;
        this.freq = new Uint8Array(64);
        this.noiseBuffer = null;
        this.timer = null;
        this.nextStepTime = 0;
        this.stepIndex = 0;
        this.startedAt = 0;
        this.muted = false;
        this.energy = 0;
        this.styleChangeGen = 0;
        this.liveMusicNodes = [];
        // Selectable suite styles — large quality catalog (real samples).
        this.styles = Object.freeze({
          gravesong: Object.freeze({"id":"gravesong","label":"Gravesong","blurb":"Dark fantasy · slow cello weight","baseBpm":68,"minBpm":58,"maxBpm":84,"swing":0,"mix":{"string":1.15,"keys":0.72,"low":2.8,"dark":4200,"reverb":0.55},"sections":[{"bar":0,"name":"Low strings","intensity":0.16},{"bar":8,"name":"Ostinato","intensity":0.32},{"bar":20,"name":"Stone piano","intensity":0.48},{"bar":36,"name":"Thin violin","intensity":0.62},{"bar":50,"name":"Weight","intensity":0.82},{"bar":60,"name":"Fade mist","intensity":0.4}],"chords":[[45,48,52],[41,45,48],[50,53,57],[40,43,47]],"bassRoots":[33,29,38,28],"celloOstinato":[0,0,7,0,0,8,7,5],"celloMelody":[45,43,41,40,38,40,41,43,45,47,48,47,45,43,41,40],"violinMelody":[57,55,53,52,53,55,57,55,52,50,52,53,55,57,55,52],"density":{"organ":1,"piano":0.5,"celloOst":1,"celloMel":1,"violin":0.45,"halfViolin":0.55,"subBass":1,"harp":0,"flute":0,"horn":0.2,"drive":0}}),
          hextech: Object.freeze({"id":"hextech","label":"Hextech Pulse","blurb":"Faster · piano drive · organ stabs","baseBpm":92,"minBpm":80,"maxBpm":112,"swing":0,"mix":{"string":1,"keys":0.95,"low":1.6,"dark":5200,"reverb":0.38},"sections":[{"bar":0,"name":"Crystal idle","intensity":0.22},{"bar":8,"name":"Core spin","intensity":0.4},{"bar":20,"name":"Lane heat","intensity":0.58},{"bar":36,"name":"Overdrive","intensity":0.74},{"bar":50,"name":"Surge","intensity":0.92},{"bar":60,"name":"Coolant","intensity":0.48}],"chords":[[48,52,55],[43,47,50],[45,48,52],[41,45,48]],"bassRoots":[36,31,33,29],"celloOstinato":[0,7,0,5,0,7,3,5],"celloMelody":[48,50,52,50,48,47,45,47,48,52,55,52,50,48,47,45],"violinMelody":[60,62,64,62,60,59,57,59,60,64,67,64,62,60,59,57],"density":{"organ":1,"piano":1,"celloOst":1,"celloMel":0.65,"violin":0.55,"halfViolin":0.7,"subBass":0.45,"harp":0.15,"flute":0,"horn":0.25,"drive":1}}),
          noxian: Object.freeze({"id":"noxian","label":"Noxian March","blurb":"Heavy march · contrabass iron","baseBpm":78,"minBpm":68,"maxBpm":96,"swing":0,"mix":{"string":1.25,"keys":0.55,"low":3.6,"dark":3600,"reverb":0.42},"sections":[{"bar":0,"name":"Iron step","intensity":0.2},{"bar":8,"name":"War hush","intensity":0.38},{"bar":20,"name":"Blade line","intensity":0.56},{"bar":36,"name":"Charge","intensity":0.72},{"bar":50,"name":"Blood","intensity":0.9},{"bar":60,"name":"Aftermath","intensity":0.44}],"chords":[[45,48,52],[40,43,47],[38,41,45],[43,47,50]],"bassRoots":[33,28,26,31],"celloOstinato":[0,0,0,7,0,0,5,7],"celloMelody":[40,41,43,40,38,40,41,43,45,43,41,40,38,36,38,40],"violinMelody":[55,57,59,57,55,52,55,57,59,60,59,57,55,52,53,55],"density":{"organ":0.55,"piano":0.35,"celloOst":1.2,"celloMel":0.85,"violin":0.35,"halfViolin":0.5,"subBass":1.15,"harp":0,"flute":0,"horn":0.4,"drive":0}}),
          shadow: Object.freeze({"id":"shadow","label":"Shadow Waltz","blurb":"Sparse · violin mist · soft keys","baseBpm":60,"minBpm":52,"maxBpm":76,"swing":0.12,"mix":{"string":1.05,"keys":0.88,"low":2,"dark":4800,"reverb":0.68},"sections":[{"bar":0,"name":"Mist","intensity":0.14},{"bar":8,"name":"Veil","intensity":0.28},{"bar":20,"name":"Whisper line","intensity":0.46},{"bar":36,"name":"Duet dusk","intensity":0.6},{"bar":50,"name":"Eclipse","intensity":0.78},{"bar":60,"name":"Fade","intensity":0.36}],"chords":[[45,48,52],[48,52,55],[41,45,48],[43,47,50]],"bassRoots":[33,36,29,31],"celloOstinato":[0,0,3,0,0,7,5,3],"celloMelody":[45,47,48,47,45,43,41,43,45,48,50,48,47,45,43,41],"violinMelody":[57,59,60,62,60,59,57,55,57,60,64,62,60,59,57,55],"density":{"organ":0.85,"piano":0.4,"celloOst":0.7,"celloMel":0.75,"violin":0.75,"halfViolin":0.85,"subBass":0.25,"harp":0.3,"flute":0.1,"horn":0,"drive":0}}),
          silver: Object.freeze({"id":"silver","label":"Silver Thread","blurb":"Long bows · light duet · airy","baseBpm":72,"minBpm":64,"maxBpm":88,"swing":0.06,"mix":{"string":1.12,"keys":0.48,"low":0.6,"dark":5600,"reverb":0.5},"sections":[{"bar":0,"name":"Silver air","intensity":0.18},{"bar":8,"name":"Thread","intensity":0.34},{"bar":20,"name":"Long line","intensity":0.5},{"bar":36,"name":"Duet silver","intensity":0.66},{"bar":50,"name":"Lift","intensity":0.8},{"bar":60,"name":"Drift","intensity":0.42}],"chords":[[48,52,55],[45,48,52],[50,53,57],[47,50,54]],"bassRoots":[48,45,50,47],"celloOstinato":[0,0,5,0,0,7,5,3],"celloMelody":[55,57,59,57,55,52,55,57,59,60,59,57,55,52,53,55],"violinMelody":[64,62,60,62,64,67,64,62,60,59,60,62,64,62,60,57],"density":{"organ":0.35,"piano":0.25,"celloOst":0.55,"celloMel":1.05,"violin":0.95,"halfViolin":0.9,"subBass":0,"harp":0.55,"flute":0.2,"horn":0.15,"drive":0}}),
          glass: Object.freeze({"id":"glass","label":"Glass Arco","blurb":"Clear cello · violin lead · no weight","baseBpm":66,"minBpm":58,"maxBpm":82,"swing":0,"mix":{"string":1.08,"keys":0.4,"low":0.35,"dark":6000,"reverb":0.58},"sections":[{"bar":0,"name":"Clear air","intensity":0.16},{"bar":8,"name":"Glass bow","intensity":0.32},{"bar":20,"name":"Violin open","intensity":0.52},{"bar":36,"name":"Mirror line","intensity":0.68},{"bar":50,"name":"Shine","intensity":0.82},{"bar":60,"name":"Still","intensity":0.4}],"chords":[[50,53,57],[48,52,55],[52,55,59],[45,48,52]],"bassRoots":[50,48,52,45],"celloOstinato":[0,0,0,5,0,0,7,5],"celloMelody":[57,55,53,55,57,59,57,55,53,52,53,55,57,59,60,57],"violinMelody":[67,64,62,64,67,69,67,64,62,60,62,64,67,64,62,60],"density":{"organ":0.25,"piano":0.2,"celloOst":0.4,"celloMel":0.95,"violin":1.1,"halfViolin":1,"subBass":0,"harp":0.35,"flute":0.65,"horn":0,"drive":0}}),
          aurora: Object.freeze({"id":"aurora","label":"Aurora Duet","blurb":"Soft long notes · gentle piano","baseBpm":64,"minBpm":56,"maxBpm":78,"swing":0.08,"mix":{"string":1.05,"keys":0.62,"low":0.9,"dark":5400,"reverb":0.62},"sections":[{"bar":0,"name":"Dawn hush","intensity":0.15},{"bar":8,"name":"Pale light","intensity":0.3},{"bar":20,"name":"Twin bows","intensity":0.48},{"bar":36,"name":"Open sky","intensity":0.64},{"bar":50,"name":"Bloom","intensity":0.78},{"bar":60,"name":"Afterglow","intensity":0.38}],"chords":[[48,52,55],[50,53,57],[45,48,52],[47,50,53]],"bassRoots":[48,50,45,47],"celloOstinato":[0,0,7,0,3,0,5,7],"celloMelody":[52,53,55,57,55,53,52,50,52,55,57,59,57,55,53,52],"violinMelody":[64,65,67,69,67,65,64,62,64,67,69,71,69,67,65,64],"density":{"organ":0.45,"piano":0.55,"celloOst":0.5,"celloMel":1,"violin":1,"halfViolin":0.95,"subBass":0.05,"harp":0.45,"flute":0.25,"horn":0.4,"drive":0}}),
          underdark: Object.freeze({"id":"underdark","label":"Underdark","blurb":"Very low · sparse · dread","baseBpm":58,"minBpm":50,"maxBpm":72,"swing":0,"mix":{"string":1.2,"keys":0.5,"low":3.8,"dark":3000,"reverb":0.72},"sections":[{"bar":0,"name":"Depth","intensity":0.12},{"bar":8,"name":"Crawl","intensity":0.28},{"bar":20,"name":"Pressure","intensity":0.46},{"bar":36,"name":"Vein","intensity":0.62},{"bar":50,"name":"Abyss","intensity":0.84},{"bar":60,"name":"Silence","intensity":0.34}],"chords":[[40,43,47],[38,41,45],[33,36,40],[36,40,43]],"bassRoots":[28,26,21,24],"celloOstinato":[0,0,0,0,0,5,0,7],"celloMelody":[40,38,36,38,40,41,40,38,36,33,36,38,40,38,36,33],"violinMelody":[52,50,48,50,52,53,52,50,48,47,48,50,52,50,48,45],"density":{"organ":0.7,"piano":0.15,"celloOst":0.9,"celloMel":0.7,"violin":0.25,"halfViolin":0.35,"subBass":1.2,"harp":0,"flute":0,"horn":0.15,"drive":0}}),
          voidchoir: Object.freeze({"id":"voidchoir","label":"Void Choir","blurb":"Organ cathedral · slow swell","baseBpm":62,"minBpm":54,"maxBpm":78,"swing":0,"mix":{"string":0.95,"keys":1.05,"low":2.2,"dark":3800,"reverb":0.78},"sections":[{"bar":0,"name":"Nave","intensity":0.18},{"bar":8,"name":"Choir pad","intensity":0.36},{"bar":20,"name":"Aisle","intensity":0.52},{"bar":36,"name":"Sanctum","intensity":0.7},{"bar":50,"name":"Spire","intensity":0.86},{"bar":60,"name":"Amen","intensity":0.4}],"chords":[[45,48,52],[41,45,48],[48,52,55],[43,47,50]],"bassRoots":[33,29,36,31],"celloOstinato":[0,0,7,0,0,0,5,0],"celloMelody":[45,45,43,41,40,41,43,45,47,48,47,45,43,41,40,41],"violinMelody":[57,55,53,55,57,59,57,55,53,52,53,55,57,55,53,52],"density":{"organ":1.25,"piano":0.2,"celloOst":0.55,"celloMel":0.6,"violin":0.4,"halfViolin":0.45,"subBass":0.55,"harp":0.1,"flute":0,"horn":0.35,"drive":0}}),
          ionia: Object.freeze({"id":"ionia","label":"Ionia Bloom","blurb":"Soft · flute color · gentle","baseBpm":74,"minBpm":66,"maxBpm":90,"swing":0.05,"mix":{"string":1,"keys":0.55,"low":0.7,"dark":5800,"reverb":0.55},"sections":[{"bar":0,"name":"Petal","intensity":0.18},{"bar":8,"name":"Stream","intensity":0.34},{"bar":20,"name":"Grove","intensity":0.5},{"bar":36,"name":"Spirit","intensity":0.66},{"bar":50,"name":"Bloom","intensity":0.8},{"bar":60,"name":"Still water","intensity":0.4}],"chords":[[48,50,55],[50,53,57],[45,48,52],[47,50,55]],"bassRoots":[48,50,45,47],"celloOstinato":[0,0,5,0,0,7,2,5],"celloMelody":[55,57,59,60,59,57,55,52,55,57,60,62,60,57,55,52],"violinMelody":[64,67,69,67,64,62,64,67,69,71,69,67,64,62,60,62],"density":{"organ":0.3,"piano":0.35,"celloOst":0.5,"celloMel":0.9,"violin":0.85,"halfViolin":0.8,"subBass":0,"harp":0.5,"flute":0.75,"horn":0.1,"drive":0}}),
          freljord: Object.freeze({"id":"freljord","label":"Freljord Wind","blurb":"Cold open fifths · sparse","baseBpm":70,"minBpm":60,"maxBpm":86,"swing":0,"mix":{"string":1.1,"keys":0.45,"low":1.4,"dark":4500,"reverb":0.7},"sections":[{"bar":0,"name":"Snow","intensity":0.14},{"bar":8,"name":"Gale","intensity":0.3},{"bar":20,"name":"Ice line","intensity":0.48},{"bar":36,"name":"Ridge","intensity":0.64},{"bar":50,"name":"Storm edge","intensity":0.8},{"bar":60,"name":"Whiteout","intensity":0.38}],"chords":[[45,52,57],[40,47,52],[43,50,55],[38,45,50]],"bassRoots":[33,28,31,26],"celloOstinato":[0,0,7,0,0,7,0,12],"celloMelody":[45,45,47,45,43,40,43,45,47,48,47,45,43,40,38,40],"violinMelody":[57,57,59,57,55,52,55,57,59,60,59,57,55,52,50,52],"density":{"organ":0.4,"piano":0.2,"celloOst":0.75,"celloMel":0.7,"violin":0.55,"halfViolin":0.5,"subBass":0.5,"harp":0.15,"flute":0.35,"horn":0.45,"drive":0}}),
          piltover: Object.freeze({"id":"piltover","label":"Piltover Clock","blurb":"Bright mid · piano tick","baseBpm":88,"minBpm":78,"maxBpm":106,"swing":0,"mix":{"string":0.95,"keys":1,"low":1.2,"dark":5600,"reverb":0.4},"sections":[{"bar":0,"name":"Gear idle","intensity":0.22},{"bar":8,"name":"Tick","intensity":0.4},{"bar":20,"name":"Workshop","intensity":0.56},{"bar":36,"name":"Spark","intensity":0.72},{"bar":50,"name":"Launch","intensity":0.9},{"bar":60,"name":"Cool","intensity":0.46}],"chords":[[48,52,55],[50,53,57],[43,47,50],[45,48,52]],"bassRoots":[36,38,31,33],"celloOstinato":[0,5,7,5,0,7,12,7],"celloMelody":[48,50,52,53,52,50,48,47,48,52,55,53,52,50,48,45],"violinMelody":[60,62,64,65,64,62,60,59,60,64,67,65,64,62,60,57],"density":{"organ":0.7,"piano":1.05,"celloOst":0.75,"celloMel":0.55,"violin":0.5,"halfViolin":0.6,"subBass":0.35,"harp":0.2,"flute":0.15,"horn":0.3,"drive":1}}),
          mistveil: Object.freeze({"id":"mistveil","label":"Mistveil","blurb":"Ultra sparse · violin whisper","baseBpm":56,"minBpm":48,"maxBpm":70,"swing":0.1,"mix":{"string":1,"keys":0.35,"low":0.5,"dark":5200,"reverb":0.8},"sections":[{"bar":0,"name":"Fog","intensity":0.1},{"bar":8,"name":"Drift","intensity":0.22},{"bar":20,"name":"Far bow","intensity":0.4},{"bar":36,"name":"Near veil","intensity":0.55},{"bar":50,"name":"Part","intensity":0.7},{"bar":60,"name":"Gone","intensity":0.3}],"chords":[[45,52,57],[48,52,55],[41,48,53],[43,50,55]],"bassRoots":[33,36,29,31],"celloOstinato":[0,0,0,7,0,0,0,5],"celloMelody":[45,45,43,45,47,45,43,41,43,45,47,48,47,45,43,41],"violinMelody":[57,59,60,59,57,55,57,59,60,62,60,59,57,55,53,55],"density":{"organ":0.25,"piano":0.15,"celloOst":0.35,"celloMel":0.55,"violin":1.05,"halfViolin":0.7,"subBass":0,"harp":0.4,"flute":0.3,"horn":0,"drive":0}}),
          willow: Object.freeze({"id":"willow","label":"Willow Cello","blurb":"Cello first · long · soft","baseBpm":68,"minBpm":60,"maxBpm":84,"swing":0.04,"mix":{"string":1.18,"keys":0.38,"low":0.8,"dark":5000,"reverb":0.52},"sections":[{"bar":0,"name":"Solo bow","intensity":0.16},{"bar":8,"name":"Root","intensity":0.32},{"bar":20,"name":"Phrase","intensity":0.5},{"bar":36,"name":"Answer","intensity":0.64},{"bar":50,"name":"Rise","intensity":0.78},{"bar":60,"name":"Rest","intensity":0.38}],"chords":[[48,52,55],[45,48,52],[50,53,57],[43,47,50]],"bassRoots":[48,45,50,43],"celloOstinato":[0,0,0,5,0,0,7,0],"celloMelody":[52,53,55,57,55,53,52,50,52,55,57,59,57,55,52,48],"violinMelody":[60,62,64,62,60,57,60,62,64,65,64,62,60,57,55,57],"density":{"organ":0.2,"piano":0.2,"celloOst":0.45,"celloMel":1.2,"violin":0.45,"halfViolin":0.4,"subBass":0,"harp":0.25,"flute":0.1,"horn":0.15,"drive":0}}),
          celestine: Object.freeze({"id":"celestine","label":"Celestine","blurb":"Violin + harp · luminous","baseBpm":70,"minBpm":62,"maxBpm":86,"swing":0.06,"mix":{"string":1.05,"keys":0.7,"low":0.45,"dark":6200,"reverb":0.6},"sections":[{"bar":0,"name":"Star","intensity":0.18},{"bar":8,"name":"Harp dust","intensity":0.34},{"bar":20,"name":"Arc","intensity":0.52},{"bar":36,"name":"Constellation","intensity":0.68},{"bar":50,"name":"Peak light","intensity":0.84},{"bar":60,"name":"Dim","intensity":0.4}],"chords":[[50,53,57],[52,55,59],[48,52,55],[45,48,52]],"bassRoots":[50,52,48,45],"celloOstinato":[0,0,7,0,0,5,0,7],"celloMelody":[55,57,59,60,59,57,55,53,55,57,60,62,60,57,55,52],"violinMelody":[67,69,71,69,67,64,67,69,71,72,71,69,67,64,62,64],"density":{"organ":0.25,"piano":0.3,"celloOst":0.4,"celloMel":0.65,"violin":1.15,"halfViolin":1,"subBass":0,"harp":0.9,"flute":0.35,"horn":0.1,"drive":0}}),
          twilight: Object.freeze({"id":"twilight","label":"Twilight Balance","blurb":"Even cello · violin · soft","baseBpm":72,"minBpm":64,"maxBpm":88,"swing":0.05,"mix":{"string":1.1,"keys":0.55,"low":1,"dark":5200,"reverb":0.55},"sections":[{"bar":0,"name":"Dusk","intensity":0.18},{"bar":8,"name":"Balance","intensity":0.34},{"bar":20,"name":"Trade","intensity":0.52},{"bar":36,"name":"Weave","intensity":0.68},{"bar":50,"name":"Glow","intensity":0.82},{"bar":60,"name":"Night","intensity":0.4}],"chords":[[45,48,52],[48,52,55],[50,53,57],[43,47,50]],"bassRoots":[45,48,50,43],"celloOstinato":[0,0,5,7,0,5,0,3],"celloMelody":[52,53,55,53,52,50,52,55,57,55,53,52,50,48,50,52],"violinMelody":[64,65,67,65,64,62,64,67,69,67,65,64,62,60,62,64],"density":{"organ":0.4,"piano":0.4,"celloOst":0.65,"celloMel":0.95,"violin":0.95,"halfViolin":0.9,"subBass":0.15,"harp":0.35,"flute":0.2,"horn":0.2,"drive":0}}),
          nocturne: Object.freeze({"id":"nocturne","label":"Nocturne","blurb":"Night minor · soft weight","baseBpm":64,"minBpm":56,"maxBpm":80,"swing":0.08,"mix":{"string":1.08,"keys":0.7,"low":1.5,"dark":4400,"reverb":0.65},"sections":[{"bar":0,"name":"Lamp","intensity":0.16},{"bar":8,"name":"Street","intensity":0.32},{"bar":20,"name":"Window","intensity":0.5},{"bar":36,"name":"Hall","intensity":0.66},{"bar":50,"name":"Midnight","intensity":0.82},{"bar":60,"name":"Out","intensity":0.38}],"chords":[[45,48,52],[41,45,48],[48,52,55],[38,41,45]],"bassRoots":[33,29,36,26],"celloOstinato":[0,0,7,0,3,0,5,7],"celloMelody":[45,47,48,50,48,47,45,43,45,48,50,52,50,48,47,45],"violinMelody":[57,59,60,62,60,59,57,55,57,60,62,64,62,60,59,57],"density":{"organ":0.75,"piano":0.45,"celloOst":0.7,"celloMel":0.85,"violin":0.7,"halfViolin":0.65,"subBass":0.4,"harp":0.2,"flute":0.1,"horn":0.25,"drive":0}}),
          emberline: Object.freeze({"id":"emberline","label":"Emberline","blurb":"Warm minor · soft horn","baseBpm":76,"minBpm":66,"maxBpm":92,"swing":0,"mix":{"string":1.05,"keys":0.6,"low":1.3,"dark":4800,"reverb":0.48},"sections":[{"bar":0,"name":"Coal","intensity":0.2},{"bar":8,"name":"Glow","intensity":0.36},{"bar":20,"name":"Line","intensity":0.54},{"bar":36,"name":"Forge soft","intensity":0.7},{"bar":50,"name":"Flame","intensity":0.86},{"bar":60,"name":"Ash","intensity":0.42}],"chords":[[45,48,52],[50,53,57],[41,45,48],[43,47,50]],"bassRoots":[33,38,29,31],"celloOstinato":[0,5,0,7,0,5,3,7],"celloMelody":[48,50,52,50,48,45,48,50,52,53,52,50,48,45,43,45],"violinMelody":[60,62,64,62,60,57,60,62,64,65,64,62,60,57,55,57],"density":{"organ":0.5,"piano":0.4,"celloOst":0.8,"celloMel":0.8,"violin":0.6,"halfViolin":0.55,"subBass":0.35,"harp":0.15,"flute":0.1,"horn":0.7,"drive":0}}),
          riftcalm: Object.freeze({"id":"riftcalm","label":"Rift Calm","blurb":"Arena idle · mid cello","baseBpm":80,"minBpm":70,"maxBpm":98,"swing":0,"mix":{"string":1.05,"keys":0.65,"low":1.1,"dark":5000,"reverb":0.45},"sections":[{"bar":0,"name":"Idle","intensity":0.2},{"bar":8,"name":"Path","intensity":0.36},{"bar":20,"name":"Brush","intensity":0.54},{"bar":36,"name":"Skirmish hush","intensity":0.7},{"bar":50,"name":"Push soft","intensity":0.84},{"bar":60,"name":"Reset","intensity":0.44}],"chords":[[48,52,55],[45,48,52],[43,47,50],[41,45,48]],"bassRoots":[36,33,31,29],"celloOstinato":[0,0,7,5,0,7,0,5],"celloMelody":[50,52,53,52,50,48,50,52,55,53,52,50,48,47,48,50],"violinMelody":[62,64,65,64,62,60,62,64,67,65,64,62,60,59,60,62],"density":{"organ":0.55,"piano":0.5,"celloOst":0.75,"celloMel":0.85,"violin":0.65,"halfViolin":0.6,"subBass":0.3,"harp":0.2,"flute":0.15,"horn":0.25,"drive":0}}),
          solari: Object.freeze({"id":"solari","label":"Solari Rise","blurb":"Brighter minor · lift","baseBpm":84,"minBpm":72,"maxBpm":102,"swing":0,"mix":{"string":1,"keys":0.75,"low":0.9,"dark":5800,"reverb":0.42},"sections":[{"bar":0,"name":"Horizon","intensity":0.22},{"bar":8,"name":"Climb","intensity":0.4},{"bar":20,"name":"Crest","intensity":0.58},{"bar":36,"name":"Sun line","intensity":0.74},{"bar":50,"name":"Peak","intensity":0.9},{"bar":60,"name":"Gold fade","intensity":0.46}],"chords":[[48,52,55],[50,53,57],[52,55,59],[45,48,52]],"bassRoots":[36,38,40,33],"celloOstinato":[0,7,12,7,0,5,7,12],"celloMelody":[52,55,57,59,57,55,52,50,52,55,59,60,59,55,52,48],"violinMelody":[64,67,69,71,69,67,64,62,64,67,71,72,71,67,64,60],"density":{"organ":0.55,"piano":0.6,"celloOst":0.6,"celloMel":0.75,"violin":0.85,"halfViolin":0.8,"subBass":0.2,"harp":0.35,"flute":0.4,"horn":0.45,"drive":0.5}}),
          hushsteel: Object.freeze({"id":"hushsteel","label":"Hush Steel","blurb":"Quiet combat · mid bows","baseBpm":82,"minBpm":72,"maxBpm":100,"swing":0,"mix":{"string":1.12,"keys":0.5,"low":1.4,"dark":4600,"reverb":0.4},"sections":[{"bar":0,"name":"Ready","intensity":0.2},{"bar":8,"name":"Step","intensity":0.38},{"bar":20,"name":"Clash hush","intensity":0.56},{"bar":36,"name":"Press","intensity":0.72},{"bar":50,"name":"Steel","intensity":0.88},{"bar":60,"name":"Hold","intensity":0.44}],"chords":[[45,48,52],[43,47,50],[40,43,47],[41,45,48]],"bassRoots":[33,31,28,29],"celloOstinato":[0,0,7,0,5,7,0,5],"celloMelody":[48,47,45,47,48,50,48,47,45,43,45,47,48,50,48,45],"violinMelody":[60,59,57,59,60,62,60,59,57,55,57,59,60,62,60,57],"density":{"organ":0.4,"piano":0.35,"celloOst":0.9,"celloMel":0.8,"violin":0.55,"halfViolin":0.55,"subBass":0.45,"harp":0,"flute":0,"horn":0.3,"drive":0}}),
          riverlight: Object.freeze({"id":"riverlight","label":"Riverlight","blurb":"Flowing cello · soft harp","baseBpm":76,"minBpm":68,"maxBpm":92,"swing":0.07,"mix":{"string":1.08,"keys":0.58,"low":0.75,"dark":5600,"reverb":0.58},"sections":[{"bar":0,"name":"Bank","intensity":0.18},{"bar":8,"name":"Current","intensity":0.34},{"bar":20,"name":"Eddy","intensity":0.5},{"bar":36,"name":"Bend","intensity":0.66},{"bar":50,"name":"Glint","intensity":0.8},{"bar":60,"name":"Shore","intensity":0.4}],"chords":[[50,53,57],[48,52,55],[52,55,59],[47,50,53]],"bassRoots":[50,48,52,47],"celloOstinato":[0,0,5,7,0,3,5,7],"celloMelody":[55,57,59,60,59,57,55,53,55,57,59,62,60,57,55,52],"violinMelody":[64,65,67,69,67,65,64,62,64,67,69,71,69,67,64,60],"density":{"organ":0.35,"piano":0.35,"celloOst":0.55,"celloMel":1,"violin":0.8,"halfViolin":0.85,"subBass":0,"harp":0.7,"flute":0.35,"horn":0.15,"drive":0}}),
          ashveil: Object.freeze({"id":"ashveil","label":"Ashveil","blurb":"Muted · after battle","baseBpm":60,"minBpm":52,"maxBpm":74,"swing":0,"mix":{"string":1.05,"keys":0.5,"low":1.8,"dark":4000,"reverb":0.7},"sections":[{"bar":0,"name":"Smoke","intensity":0.14},{"bar":8,"name":"Ash","intensity":0.28},{"bar":20,"name":"Quiet field","intensity":0.44},{"bar":36,"name":"Wind","intensity":0.58},{"bar":50,"name":"Ember rest","intensity":0.72},{"bar":60,"name":"Cold","intensity":0.34}],"chords":[[40,43,47],[45,48,52],[38,41,45],[43,47,50]],"bassRoots":[28,33,26,31],"celloOstinato":[0,0,0,5,0,0,7,0],"celloMelody":[43,41,40,41,43,45,43,41,40,38,40,41,43,45,43,40],"violinMelody":[55,53,52,53,55,57,55,53,52,50,52,53,55,57,55,52],"density":{"organ":0.55,"piano":0.25,"celloOst":0.6,"celloMel":0.75,"violin":0.5,"halfViolin":0.45,"subBass":0.55,"harp":0.1,"flute":0,"horn":0.2,"drive":0}}),
          silkroad: Object.freeze({"id":"silkroad","label":"Silk Road","blurb":"Traveling theme · mid bows","baseBpm":78,"minBpm":70,"maxBpm":94,"swing":0.05,"mix":{"string":1.05,"keys":0.5,"low":0.95,"dark":5400,"reverb":0.5},"sections":[{"bar":0,"name":"Path","intensity":0.2},{"bar":8,"name":"Caravan","intensity":0.36},{"bar":20,"name":"Pass","intensity":0.52},{"bar":36,"name":"Vista","intensity":0.68},{"bar":50,"name":"Camp","intensity":0.82},{"bar":60,"name":"Stars","intensity":0.42}],"chords":[[48,52,55],[50,53,57],[45,50,53],[47,52,55]],"bassRoots":[36,38,33,35],"celloOstinato":[0,5,0,7,0,5,2,7],"celloMelody":[52,53,55,57,55,53,50,52,55,57,59,57,55,52,50,48],"violinMelody":[64,65,67,69,67,65,62,64,67,69,71,69,67,64,62,60],"density":{"organ":0.35,"piano":0.4,"celloOst":0.65,"celloMel":0.9,"violin":0.85,"halfViolin":0.8,"subBass":0.15,"harp":0.45,"flute":0.4,"horn":0.3,"drive":0}}),
          deepwell: Object.freeze({"id":"deepwell","label":"Deep Well","blurb":"Low cello well · organ","baseBpm":66,"minBpm":58,"maxBpm":80,"swing":0,"mix":{"string":1.15,"keys":0.75,"low":2.6,"dark":3600,"reverb":0.66},"sections":[{"bar":0,"name":"Stone rim","intensity":0.16},{"bar":8,"name":"Drop","intensity":0.32},{"bar":20,"name":"Echo","intensity":0.48},{"bar":36,"name":"Depth","intensity":0.64},{"bar":50,"name":"Pressure","intensity":0.8},{"bar":60,"name":"Surface","intensity":0.38}],"chords":[[40,43,47],[45,48,52],[38,41,45],[41,45,48]],"bassRoots":[28,33,26,29],"celloOstinato":[0,0,7,0,0,5,0,7],"celloMelody":[40,41,43,45,43,41,40,38,40,43,45,47,45,43,40,36],"violinMelody":[52,53,55,57,55,53,52,50,52,55,57,59,57,55,52,48],"density":{"organ":0.9,"piano":0.25,"celloOst":0.85,"celloMel":0.85,"violin":0.4,"halfViolin":0.4,"subBass":0.85,"harp":0,"flute":0,"horn":0.25,"drive":0}}),
          bloodmoon: Object.freeze({"id":"bloodmoon","label":"Blood Moon","blurb":"Ritual dark · thin violin","baseBpm":58,"minBpm":50,"maxBpm":72,"swing":0.04,"mix":{"string":1.12,"keys":0.55,"low":2.4,"dark":3400,"reverb":0.74},"sections":[{"bar":0,"name":"Rite","intensity":0.14},{"bar":8,"name":"Red hush","intensity":0.3},{"bar":20,"name":"Circle","intensity":0.48},{"bar":36,"name":"Omen","intensity":0.66},{"bar":50,"name":"Eclipse blood","intensity":0.84},{"bar":60,"name":"Still","intensity":0.36}],"chords":[[40,43,47],[45,48,52],[38,41,45],[43,47,50]],"bassRoots":[28,33,26,31],"celloOstinato":[0,0,0,7,0,5,0,3],"celloMelody":[40,41,43,41,40,38,40,43,45,43,41,40,38,36,38,40],"violinMelody":[55,53,52,53,55,57,55,53,52,50,52,55,57,55,52,48],"density":{"organ":0.85,"piano":0.2,"celloOst":0.75,"celloMel":0.7,"violin":0.65,"halfViolin":0.55,"subBass":0.7,"harp":0.05,"flute":0,"horn":0.2,"drive":0}}),
          demacia: Object.freeze({"id":"demacia","label":"Demacia Light","blurb":"Noble mid · horn + strings","baseBpm":80,"minBpm":70,"maxBpm":98,"swing":0,"mix":{"string":1.08,"keys":0.7,"low":1.1,"dark":5600,"reverb":0.42},"sections":[{"bar":0,"name":"Walls","intensity":0.2},{"bar":8,"name":"Banner","intensity":0.38},{"bar":20,"name":"March soft","intensity":0.56},{"bar":36,"name":"Crest","intensity":0.72},{"bar":50,"name":"Glory hush","intensity":0.88},{"bar":60,"name":"Home","intensity":0.44}],"chords":[[48,52,55],[50,53,57],[45,48,52],[43,47,50]],"bassRoots":[36,38,33,31],"celloOstinato":[0,7,0,5,0,7,12,7],"celloMelody":[52,53,55,57,55,53,52,50,52,55,57,59,57,55,52,48],"violinMelody":[64,65,67,69,67,65,64,62,64,67,69,71,69,67,64,60],"density":{"organ":0.5,"piano":0.45,"celloOst":0.7,"celloMel":0.8,"violin":0.75,"halfViolin":0.7,"subBass":0.25,"harp":0.25,"flute":0.2,"horn":0.75,"drive":0.25}}),
          zaun: Object.freeze({"id":"zaun","label":"Zaun Chem","blurb":"Gritty mid · piano pulse","baseBpm":90,"minBpm":78,"maxBpm":110,"swing":0,"mix":{"string":0.95,"keys":0.95,"low":1.7,"dark":4800,"reverb":0.36},"sections":[{"bar":0,"name":"Pipe","intensity":0.22},{"bar":8,"name":"Valve","intensity":0.4},{"bar":20,"name":"Spark","intensity":0.58},{"bar":36,"name":"Fumes","intensity":0.74},{"bar":50,"name":"Overclock","intensity":0.92},{"bar":60,"name":"Drain","intensity":0.46}],"chords":[[45,48,52],[43,47,50],[48,52,55],[41,45,48]],"bassRoots":[33,31,36,29],"celloOstinato":[0,5,7,5,0,7,3,5],"celloMelody":[48,50,52,50,48,47,45,47,48,52,53,52,50,48,47,45],"violinMelody":[60,62,64,62,60,59,57,59,60,64,65,64,62,60,59,57],"density":{"organ":0.65,"piano":1,"celloOst":0.85,"celloMel":0.55,"violin":0.45,"halfViolin":0.55,"subBass":0.5,"harp":0.05,"flute":0,"horn":0.2,"drive":1}}),
          targon: Object.freeze({"id":"targon","label":"Targon Peak","blurb":"Cosmic sparse · high bows","baseBpm":62,"minBpm":54,"maxBpm":78,"swing":0.06,"mix":{"string":1.1,"keys":0.5,"low":0.55,"dark":6000,"reverb":0.72},"sections":[{"bar":0,"name":"Summit air","intensity":0.14},{"bar":8,"name":"Stars","intensity":0.3},{"bar":20,"name":"Constellation","intensity":0.48},{"bar":36,"name":"Peak line","intensity":0.66},{"bar":50,"name":"Void edge","intensity":0.82},{"bar":60,"name":"Descend","intensity":0.36}],"chords":[[50,53,57],[52,55,59],[48,52,55],[45,50,53]],"bassRoots":[50,52,48,45],"celloOstinato":[0,0,7,0,0,12,7,5],"celloMelody":[55,57,59,60,59,57,55,52,55,57,60,62,60,57,55,52],"violinMelody":[67,69,71,72,71,69,67,64,67,69,72,74,72,69,67,64],"density":{"organ":0.35,"piano":0.25,"celloOst":0.4,"celloMel":0.7,"violin":1.1,"halfViolin":0.95,"subBass":0,"harp":0.55,"flute":0.45,"horn":0.15,"drive":0}}),
          bilgewater: Object.freeze({"id":"bilgewater","label":"Bilgewater Tide","blurb":"Sway · mid cello · soft","baseBpm":72,"minBpm":64,"maxBpm":88,"swing":0.14,"mix":{"string":1.08,"keys":0.55,"low":1.2,"dark":5000,"reverb":0.55},"sections":[{"bar":0,"name":"Dock","intensity":0.18},{"bar":8,"name":"Tide","intensity":0.34},{"bar":20,"name":"Hull","intensity":0.52},{"bar":36,"name":"Horizon","intensity":0.68},{"bar":50,"name":"Storm edge","intensity":0.84},{"bar":60,"name":"Calm port","intensity":0.4}],"chords":[[45,48,52],[48,52,55],[43,47,50],[41,45,48]],"bassRoots":[33,36,31,29],"celloOstinato":[0,0,5,0,7,5,0,3],"celloMelody":[48,50,52,53,52,50,48,47,48,50,53,55,53,50,48,45],"violinMelody":[60,62,64,65,64,62,60,59,60,62,65,67,65,62,60,57],"density":{"organ":0.4,"piano":0.35,"celloOst":0.7,"celloMel":0.95,"violin":0.7,"halfViolin":0.7,"subBass":0.3,"harp":0.3,"flute":0.2,"horn":0.25,"drive":0}}),
          blackmist: Object.freeze({"id":"blackmist","label":"Black Mist","blurb":"Dread sparse · low organ","baseBpm":54,"minBpm":48,"maxBpm":68,"swing":0,"mix":{"string":1.15,"keys":0.65,"low":3,"dark":3000,"reverb":0.78},"sections":[{"bar":0,"name":"Fog wall","intensity":0.1},{"bar":8,"name":"Whisper","intensity":0.24},{"bar":20,"name":"Pull","intensity":0.42},{"bar":36,"name":"Drown soft","intensity":0.6},{"bar":50,"name":"Abyss","intensity":0.8},{"bar":60,"name":"Fade","intensity":0.32}],"chords":[[40,43,47],[38,41,45],[33,36,40],[36,40,43]],"bassRoots":[28,26,21,24],"celloOstinato":[0,0,0,0,0,0,5,0],"celloMelody":[40,38,36,38,40,41,40,38,36,33,36,38,40,38,36,33],"violinMelody":[52,50,48,50,52,53,52,50,48,45,48,50,52,50,48,45],"density":{"organ":1,"piano":0.1,"celloOst":0.65,"celloMel":0.55,"violin":0.3,"halfViolin":0.25,"subBass":1,"harp":0,"flute":0,"horn":0.1,"drive":0}}),
          crystalspire: Object.freeze({"id":"crystalspire","label":"Crystal Spire","blurb":"Bright harp · clear piano","baseBpm":78,"minBpm":68,"maxBpm":96,"swing":0.04,"mix":{"string":0.95,"keys":0.95,"low":0.55,"dark":6400,"reverb":0.48},"sections":[{"bar":0,"name":"Facet","intensity":0.2},{"bar":8,"name":"Sparkle","intensity":0.36},{"bar":20,"name":"Prism","intensity":0.54},{"bar":36,"name":"Spire","intensity":0.72},{"bar":50,"name":"Flash","intensity":0.88},{"bar":60,"name":"Rest light","intensity":0.42}],"chords":[[50,53,57],[52,55,59],[48,52,55],[47,50,53]],"bassRoots":[50,52,48,47],"celloOstinato":[0,5,7,12,0,7,5,7],"celloMelody":[55,57,59,60,59,57,55,53,55,57,60,62,60,57,55,52],"violinMelody":[67,69,71,72,71,69,67,65,67,69,72,74,72,69,67,64],"density":{"organ":0.3,"piano":0.85,"celloOst":0.4,"celloMel":0.55,"violin":0.7,"halfViolin":0.75,"subBass":0,"harp":1,"flute":0.35,"horn":0.1,"drive":0.35}}),
          ironvale: Object.freeze({"id":"ironvale","label":"Ironvale","blurb":"Combat mid · cello iron","baseBpm":84,"minBpm":74,"maxBpm":104,"swing":0,"mix":{"string":1.15,"keys":0.5,"low":1.8,"dark":4400,"reverb":0.4},"sections":[{"bar":0,"name":"Guard","intensity":0.22},{"bar":8,"name":"Step","intensity":0.4},{"bar":20,"name":"Clash","intensity":0.58},{"bar":36,"name":"Push","intensity":0.74},{"bar":50,"name":"Hold line","intensity":0.9},{"bar":60,"name":"Breathe","intensity":0.46}],"chords":[[45,48,52],[40,43,47],[43,47,50],[41,45,48]],"bassRoots":[33,28,31,29],"celloOstinato":[0,0,7,5,0,7,5,3],"celloMelody":[48,47,45,47,48,50,48,47,45,43,45,47,48,50,48,45],"violinMelody":[60,59,57,59,60,62,60,59,57,55,57,59,60,62,60,57],"density":{"organ":0.45,"piano":0.4,"celloOst":1.05,"celloMel":0.8,"violin":0.5,"halfViolin":0.5,"subBass":0.55,"harp":0,"flute":0,"horn":0.4,"drive":0.3}}),
          duskpetal: Object.freeze({"id":"duskpetal","label":"Dusk Petal","blurb":"Ultra soft · long bows","baseBpm":60,"minBpm":52,"maxBpm":74,"swing":0.1,"mix":{"string":1.05,"keys":0.45,"low":0.4,"dark":5800,"reverb":0.68},"sections":[{"bar":0,"name":"Petal fall","intensity":0.12},{"bar":8,"name":"Dusk air","intensity":0.26},{"bar":20,"name":"Soft line","intensity":0.44},{"bar":36,"name":"Twin hush","intensity":0.6},{"bar":50,"name":"Bloom dim","intensity":0.74},{"bar":60,"name":"Sleep","intensity":0.34}],"chords":[[48,52,55],[50,53,57],[45,48,52],[47,50,53]],"bassRoots":[48,50,45,47],"celloOstinato":[0,0,0,5,0,0,7,3],"celloMelody":[52,53,55,53,52,50,52,55,57,55,53,52,50,48,50,52],"violinMelody":[64,65,67,65,64,62,64,67,69,67,65,64,62,60,62,64],"density":{"organ":0.2,"piano":0.3,"celloOst":0.35,"celloMel":1.05,"violin":1,"halfViolin":0.9,"subBass":0,"harp":0.55,"flute":0.4,"horn":0.1,"drive":0}}),
          stormcall: Object.freeze({"id":"stormcall","label":"Stormcall","blurb":"Rising heat · horn swell","baseBpm":86,"minBpm":74,"maxBpm":108,"swing":0,"mix":{"string":1.05,"keys":0.7,"low":1.4,"dark":5000,"reverb":0.46},"sections":[{"bar":0,"name":"Cloud","intensity":0.22},{"bar":8,"name":"Wind up","intensity":0.4},{"bar":20,"name":"Thunder hush","intensity":0.58},{"bar":36,"name":"Call","intensity":0.74},{"bar":50,"name":"Break","intensity":0.92},{"bar":60,"name":"Rain cool","intensity":0.46}],"chords":[[45,48,52],[48,52,55],[43,47,50],[41,45,48]],"bassRoots":[33,36,31,29],"celloOstinato":[0,7,0,5,0,7,5,12],"celloMelody":[50,52,53,55,53,52,50,48,50,53,55,57,55,52,50,48],"violinMelody":[62,64,65,67,65,64,62,60,62,65,67,69,67,64,62,60],"density":{"organ":0.55,"piano":0.55,"celloOst":0.75,"celloMel":0.7,"violin":0.7,"halfViolin":0.7,"subBass":0.35,"harp":0.15,"flute":0.15,"horn":0.85,"drive":0.55}}),
          stillwater: Object.freeze({"id":"stillwater","label":"Stillwater","blurb":"Bare cello · space","baseBpm":56,"minBpm":50,"maxBpm":70,"swing":0.08,"mix":{"string":1.12,"keys":0.3,"low":0.7,"dark":5200,"reverb":0.7},"sections":[{"bar":0,"name":"Surface","intensity":0.1},{"bar":8,"name":"Ripple","intensity":0.24},{"bar":20,"name":"Depth soft","intensity":0.4},{"bar":36,"name":"Long note","intensity":0.56},{"bar":50,"name":"Mirror","intensity":0.7},{"bar":60,"name":"Quiet","intensity":0.3}],"chords":[[48,52,55],[45,48,52],[50,53,57],[43,47,50]],"bassRoots":[48,45,50,43],"celloOstinato":[0,0,0,0,0,5,0,0],"celloMelody":[52,52,50,52,53,52,50,48,50,52,55,53,52,50,48,45],"violinMelody":[60,60,59,60,62,60,59,57,59,60,64,62,60,59,57,55],"density":{"organ":0.15,"piano":0.15,"celloOst":0.3,"celloMel":1.15,"violin":0.55,"halfViolin":0.45,"subBass":0,"harp":0.2,"flute":0.15,"horn":0,"drive":0}}),
          forgeglow: Object.freeze({"id":"forgeglow","label":"Forge Glow","blurb":"Warm low · soft organ","baseBpm":74,"minBpm":64,"maxBpm":90,"swing":0,"mix":{"string":1.1,"keys":0.7,"low":2,"dark":4200,"reverb":0.5},"sections":[{"bar":0,"name":"Coal bed","intensity":0.18},{"bar":8,"name":"Heat","intensity":0.36},{"bar":20,"name":"Hammer hush","intensity":0.54},{"bar":36,"name":"Glow","intensity":0.7},{"bar":50,"name":"Metal song","intensity":0.86},{"bar":60,"name":"Cool","intensity":0.4}],"chords":[[45,48,52],[40,43,47],[48,52,55],[43,47,50]],"bassRoots":[33,28,36,31],"celloOstinato":[0,0,7,0,5,0,7,5],"celloMelody":[45,47,48,50,48,47,45,43,45,48,50,52,50,48,45,43],"violinMelody":[57,59,60,62,60,59,57,55,57,60,62,64,62,60,57,55],"density":{"organ":0.85,"piano":0.35,"celloOst":0.85,"celloMel":0.8,"violin":0.45,"halfViolin":0.45,"subBass":0.65,"harp":0.05,"flute":0,"horn":0.45,"drive":0}}),
          skyglass: Object.freeze({"id":"skyglass","label":"Skyglass","blurb":"Airy violin · flute color","baseBpm":70,"minBpm":62,"maxBpm":86,"swing":0.05,"mix":{"string":1.05,"keys":0.45,"low":0.35,"dark":6200,"reverb":0.6},"sections":[{"bar":0,"name":"Sky open","intensity":0.16},{"bar":8,"name":"Glass air","intensity":0.32},{"bar":20,"name":"Float","intensity":0.5},{"bar":36,"name":"Arc","intensity":0.66},{"bar":50,"name":"Sun line","intensity":0.82},{"bar":60,"name":"Clear","intensity":0.38}],"chords":[[50,53,57],[52,55,59],[48,52,55],[47,50,54]],"bassRoots":[50,52,48,47],"celloOstinato":[0,0,5,0,0,7,5,12],"celloMelody":[57,59,60,59,57,55,57,59,60,62,60,57,55,52,55,57],"violinMelody":[69,71,72,71,69,67,69,71,72,74,72,69,67,64,67,69],"density":{"organ":0.2,"piano":0.25,"celloOst":0.35,"celloMel":0.6,"violin":1.15,"halfViolin":1.05,"subBass":0,"harp":0.4,"flute":0.85,"horn":0.1,"drive":0}}),
        });
        this.styleId = "gravesong";
        this.applyStyle(this.styleId, { silent: true });
        this.heat = 0.12;
        this.targetHeat = 0.12;
        this.actionPulse = 0;
        this.fallbackStart = performance.now() / 1000;
        // Real multipiano banks (tonejs-instruments, CC-BY 3.0) under ./audio/
        this.sampleBanks = null;
        this.samplesReady = false;
        // Prefer packed manifest (all downloaded free samples); fallback to core set.
        this.sampleManifest = (typeof window !== "undefined" && window.RIFTBOMB_SAMPLE_MANIFEST)
          ? window.RIFTBOMB_SAMPLE_MANIFEST
          : Object.freeze({
              cello: ["C2", "D2", "E2", "G2", "A2", "C3", "D3", "E3", "G3", "A3", "C4", "D4", "E4", "G4", "A4"],
              violin: ["G3", "A3", "C4", "E4", "G4", "A4", "C5", "E5", "G5"],
              piano: ["A1", "C2", "E2", "A2", "C3", "E3", "A3", "C4", "E4", "A4", "C5"],
              organ: ["C1", "A1", "C2", "A2", "C3", "Ds3", "Fs3", "A3", "C4", "Ds4", "A4", "C5"],
              contrabass: ["G1", "As1", "C2", "D2", "E2", "Fs2", "A2", "Cs3", "E3", "Gs3"]
            });
      }

      get duration() {
        return this.totalBars * 4 * 60 / this.baseBpm;
      }

      listStyles() {
        return Object.values(this.styles).map((style) => ({
          id: style.id,
          label: style.label,
          blurb: style.blurb
        }));
      }

      applyStyle(styleId, { silent = false } = {}) {
        const style = this.styles[styleId] || this.styles.gravesong;
        this.styleId = style.id;
        this.baseBpm = style.baseBpm;
        this.minBpm = style.minBpm;
        this.maxBpm = style.maxBpm;
        this.swing = style.swing;
        this.sections = style.sections;
        this.chords = style.chords;
        this.bassRoots = style.bassRoots;
        this.celloOstinato = style.celloOstinato;
        this.celloMelody = style.celloMelody;
        this.violinMelody = style.violinMelody;
        this.density = style.density;
        this.mix = style.mix;
        this.totalBars = 68;
        this.totalSteps = this.totalBars * 16;
        this.bpm = this.baseBpm;
        this.targetBpm = this.baseBpm;
        this.stepDuration = 60 / this.bpm / 4;
        this.liveSectionName = style.sections[0].name;
        this.applyMixGraph();
        if (!silent) {
          this.cutMusicVoices();
          this.stepIndex = 0;
          if (this.ctx) {
            this.nextStepTime = this.ctx.currentTime + 0.08;
            this.startedAt = this.nextStepTime;
          }
        }
        return style;
      }

      setStyle(styleId) {
        return this.applyStyle(styleId);
      }

      /**
       * Select a style and begin (or restart) audible playback so the intro
       * picker can preview tracks on click. First call loads sample banks.
       */
      async previewStyle(styleId) {
        const gen = ++this.styleChangeGen;
        // Cut immediately so rapid clicks never stack previous styles.
        this.cutMusicVoices();
        const style = this.applyStyle(styleId, { silent: true });
        await this.start();
        if (gen !== this.styleChangeGen) return style;
        if (this.ctx?.state === "suspended") {
          try { await this.ctx.resume(); } catch { /* autoplay policy */ }
        }
        if (gen !== this.styleChangeGen) return style;
        // Hard cut again after load, then restart the phrase cleanly.
        this.cutMusicVoices();
        this.stepIndex = 0;
        this.heat = 0.14;
        this.targetHeat = 0.14;
        this.bpm = this.baseBpm;
        this.targetBpm = this.baseBpm;
        this.stepDuration = 60 / this.bpm / 4;
        this.liveSectionName = style.sections[0].name;
        this.applyMixGraph();
        if (this.ctx) {
          this.nextStepTime = this.ctx.currentTime + 0.06;
          this.startedAt = this.nextStepTime;
          this.scheduler();
        }
        if (this.muted && this.master && this.ctx) {
          this.muted = false;
          this.master.gain.cancelScheduledValues(this.ctx.currentTime);
          this.master.gain.setTargetAtTime(0.84, this.ctx.currentTime, 0.04);
        }
        return style;
      }

      /** Register a music oscillator / buffer source so style changes can stop it. */
      trackMusicVoice(source, gain = null) {
        if (!source && !gain) return;
        this.liveMusicNodes.push({ source, gain });
        if (this.liveMusicNodes.length > 240) {
          this.liveMusicNodes = this.liveMusicNodes.slice(-120);
        }
      }

      /**
       * Stop every active music voice and swap string/keys buses so already-scheduled
       * notes cannot keep ringing under the next style (preview click fix).
       */
      cutMusicVoices() {
        if (!this.ctx) {
          this.liveMusicNodes = [];
          return;
        }
        const now = this.ctx.currentTime;
        const fade = 0.035;

        for (const voice of this.liveMusicNodes) {
          try {
            if (voice.gain?.gain) {
              const g = voice.gain.gain;
              g.cancelScheduledValues(now);
              const current = Math.max(0.0001, g.value || 0.0001);
              g.setValueAtTime(current, now);
              g.linearRampToValueAtTime(0.0001, now + fade);
            }
            if (voice.source) {
              try { voice.source.stop(now + fade + 0.01); } catch { /* already stopped */ }
            }
          } catch { /* ignore dead nodes */ }
        }
        this.liveMusicNodes = [];

        // Swap instrument buses so any untracked node still on the old bus dies with it.
        if (this.musicBus && this.stringBus && this.keysBus) {
          const dying = [this.stringBus, this.keysBus, this.stringReverb, this.keysReverb];
          for (const node of dying) {
            if (!node?.gain) continue;
            try {
              node.gain.cancelScheduledValues(now);
              node.gain.setValueAtTime(Math.max(0.0001, node.gain.value || 0.0001), now);
              node.gain.linearRampToValueAtTime(0.0001, now + fade);
            } catch { /* */ }
          }
          setTimeout(() => {
            for (const node of dying) {
              try { node.disconnect(); } catch { /* */ }
            }
          }, 90);

          this.stringBus = this.ctx.createGain();
          this.stringBus.gain.value = this.mix?.string ?? 1.15;
          this.stringBus.connect(this.musicBus);
          this.stringReverb = this.ctx.createGain();
          this.stringReverb.gain.value = 0.5;
          this.stringBus.connect(this.stringReverb);
          this.stringReverb.connect(this.reverb);
          this.celloBus = this.stringBus;

          this.keysBus = this.ctx.createGain();
          this.keysBus.gain.value = this.mix?.keys ?? 0.78;
          this.keysBus.connect(this.musicBus);
          this.keysReverb = this.ctx.createGain();
          this.keysReverb.gain.value = 0.45;
          this.keysBus.connect(this.keysReverb);
          this.keysReverb.connect(this.reverb);
        }

        // Snuff reverb tail so the previous style doesn't hang in the wet bus.
        if (this.reverbGain?.gain) {
          const wet = this.mix?.reverb ?? 0.55;
          this.reverbGain.gain.cancelScheduledValues(now);
          this.reverbGain.gain.setValueAtTime(Math.max(0.0001, this.reverbGain.gain.value || wet), now);
          this.reverbGain.gain.linearRampToValueAtTime(0.0001, now + fade);
          this.reverbGain.gain.linearRampToValueAtTime(wet, now + fade + 0.08);
        }
      }

      applyMixGraph() {
        if (!this.ctx || !this.mix) return;
        if (this.stringBus) this.stringBus.gain.value = this.mix.string;
        if (this.keysBus) this.keysBus.gain.value = this.mix.keys;
        if (this.musicLow) this.musicLow.gain.value = this.mix.low;
        if (this.musicDark) this.musicDark.frequency.value = this.mix.dark;
        if (this.reverbGain) this.reverbGain.gain.value = this.mix.reverb;
      }

      syncFromGame(game, dt = 1 / 60) {
        this.targetHeat = this.computeArenaHeat(game);
        this.actionPulse = Math.max(0, this.actionPulse - dt * 0.5);
        const heatRate = 1 - Math.exp(-dt * 1.8);
        this.heat = this.heat + (this.targetHeat - this.heat) * heatRate;
        this.targetBpm = this.minBpm + (this.maxBpm - this.minBpm) * this.heat;
        const bpmRate = 1 - Math.exp(-dt * 1.2);
        this.bpm = this.bpm + (this.targetBpm - this.bpm) * bpmRate;
        this.stepDuration = 60 / Math.max(40, this.bpm) / 4;
        this.liveSectionName = this.phaseName();
      }

      computeArenaHeat(game) {
        if (!game) return 0.12;
        if (game.mode === "intro") return 0.1;
        if (game.mode === "matchover") return 0.42;
        if (game.paused) return Math.max(0.08, this.heat * 0.5);
        if (game.roundLocked) return 0.22;
        let heat = 0.12;
        for (const p of game.players || []) {
          if (!p?.alive) { heat += 0.07; continue; }
          if (p.moving) heat += 0.05;
          if (p.dashing > 0) heat += 0.08;
          if (p.castAnim > 0 || p.ultChannel > 0 || p.spin > 0 || p.zedUltAnim > 0 ||
              p.renektonUltAnim > 0 || p.vladimirPool > 0 || p.gangplankUltAnim > 0) heat += 0.1;
          if (p.health / Math.max(1, p.maxHealth) <= 0.5) heat += 0.06;
        }
        const bombs = (game.bombs || []).filter((b) => !b.exploded).length;
        const blasts = (game.blasts || []).length;
        const projectiles = (game.projectiles || []).length + (game.daggers || []).length;
        heat += Math.min(0.18, bombs * 0.06);
        heat += Math.min(0.14, blasts * 0.05);
        heat += Math.min(0.12, projectiles * 0.03);
        heat += this.actionPulse * 0.5;
        if (typeof game.roundTime === "number" && game.roundTime < 30) {
          heat += (1 - game.roundTime / 30) * 0.1;
        }
        if (game.roundWins) {
          const nearWin = game.roundWins.some((w) => w >= (game.matchTarget || 3) - 1);
          if (nearWin) heat += 0.05;
        }
        return clamp(heat, 0.06, 1);
      }

      pulseAction(amount = 0.22) {
        this.actionPulse = clamp(this.actionPulse + amount, 0, 1);
      }

      phaseName() {
        const h = this.heat;
        const style = this.styles[this.styleId] || this.styles.gravesong;
        const names = style.sections.map((section) => section.name);
        if (h < 0.2) return names[0];
        if (h < 0.38) return names[1];
        if (h < 0.55) return names[2];
        if (h < 0.72) return names[3];
        if (h < 0.88) return names[4];
        return names[5] || names[names.length - 1];
      }

      sectionForBar(bar) {
        if (this.liveSectionName) return { bar, name: this.liveSectionName, intensity: this.heat };
        let section = this.sections[0];
        for (const candidate of this.sections) if (bar >= candidate.bar) section = candidate;
        return section;
      }

      resolveSampleBase() {
        try {
          return new URL("audio/", window.location.href).href;
        } catch {
          return "./audio/";
        }
      }

      noteNameToMidi(name) {
        const match = /^([A-G])(s?)(-?\d+)$/.exec(name);
        if (!match) return null;
        const semis = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
        const base = semis[match[1]];
        if (base == null) return null;
        const sharp = match[2] === "s" ? 1 : 0;
        const oct = Number(match[3]);
        return (oct + 1) * 12 + base + sharp;
      }

      /** Decode data:audio/ogg;base64,... without network (works on file://). */
      async decodeSampleDataUrl(dataUrl) {
        const comma = dataUrl.indexOf(",");
        const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return this.ctx.decodeAudioData(bytes.buffer.slice(0));
      }

      async loadSampleBanks() {
        if (typeof window !== "undefined" && window.RIFTBOMB_SAMPLE_MANIFEST) {
          this.sampleManifest = window.RIFTBOMB_SAMPLE_MANIFEST;
        }
        this.sampleBanks = {};
        for (const instrument of Object.keys(this.sampleManifest)) {
          this.sampleBanks[instrument] = {};
        }
        const embedded = typeof window !== "undefined" ? window.RIFTBOMB_SAMPLE_BANK : null;
        if (!embedded) {
          console.warn("[music] RIFTBOMB_SAMPLE_BANK missing — run node game/pack-sample-bank.mjs");
          this.samplesReady = false;
          return;
        }

        const jobs = [];
        for (const [instrument, names] of Object.entries(this.sampleManifest)) {
          for (const name of names) {
            const key = `${instrument}/${name}`;
            const dataUrl = embedded[key];
            if (!dataUrl) continue;
            jobs.push((async () => {
              try {
                const buffer = await this.decodeSampleDataUrl(dataUrl);
                const midi = this.noteNameToMidi(name);
                if (midi != null) this.sampleBanks[instrument][midi] = buffer;
              } catch (error) {
                console.warn("[music] sample decode fail", key, error);
              }
            })());
          }
        }

        await Promise.all(jobs);
        const loaded = Object.values(this.sampleBanks).reduce((n, bank) => n + Object.keys(bank).length, 0);
        this.samplesReady = loaded > 0;
        console.info(`[music] loaded ${loaded} real samples (${Object.keys(this.sampleBanks).join(", ")})`);
      }

      nearestSampleMidi(bank, midi) {
        const keys = Object.keys(bank).map(Number);
        if (!keys.length) return null;
        let best = keys[0];
        let bestDist = Math.abs(midi - best);
        for (const key of keys) {
          const dist = Math.abs(midi - key);
          if (dist < bestDist) {
            best = key;
            bestDist = dist;
          }
        }
        // Refuse extreme stretches (keep timbre honest).
        if (bestDist > 7) return null;
        return best;
      }

      /**
       * Play a real multipiano/string sample. Returns true if a sample fired.
       */
      playSample(instrument, midi, time, duration, velocity, {
        bus = "string",
        attack = 0.08,
        release = 0.4,
        filterHz = 0
      } = {}) {
        if (!this.samplesReady || !this.ctx || !this.sampleBanks?.[instrument]) return false;
        const bank = this.sampleBanks[instrument];
        const nearest = this.nearestSampleMidi(bank, midi);
        if (nearest == null) return false;
        const buffer = bank[nearest];
        if (!buffer) return false;

        const rate = clamp(Math.pow(2, (midi - nearest) / 12), 0.5, 1.9);
        const source = this.ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = rate;

        const gain = this.ctx.createGain();
        const attackT = Math.max(0.01, attack);
        const releaseT = Math.max(0.05, release);
        const end = time + Math.max(0.12, duration);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(Math.max(0.0002, velocity), time + attackT);
        const fadeStart = Math.max(time + attackT + 0.05, end - releaseT);
        gain.gain.setValueAtTime(Math.max(0.0002, velocity * 0.92), fadeStart);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        let output = source;
        if (filterHz > 0) {
          const filter = this.ctx.createBiquadFilter();
          filter.type = "lowpass";
          filter.frequency.value = filterHz;
          filter.Q.value = 0.5;
          source.connect(filter);
          output = filter;
        }
        output.connect(gain);
        if (bus === "keys") this.connectKeys(gain);
        else this.connectString(gain);

        const playLen = Math.min(buffer.duration / rate, duration + releaseT + 0.1);
        try {
          source.start(time, 0, playLen);
          source.stop(end + 0.08);
          this.trackMusicVoice(source, gain);
        } catch {
          return false;
        }
        return true;
      }

      async start() {
        if (this.ctx) {
          if (this.ctx.state === "suspended") await this.ctx.resume();
          return;
        }
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx({ latencyHint: "interactive" });
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.88;
        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = this.musicLevel;
        this.musicDark = this.ctx.createBiquadFilter();
        this.musicDark.type = "lowpass";
        this.musicDark.frequency.value = 4200;
        this.musicDark.Q.value = 0.4;
        this.musicLow = this.ctx.createBiquadFilter();
        this.musicLow.type = "lowshelf";
        this.musicLow.frequency.value = 140;
        this.musicLow.gain.value = 2.8;
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 0.96;
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this.createImpulse(4.6, 2.4);
        this.reverbTone = this.ctx.createBiquadFilter();
        this.reverbTone.type = "lowpass";
        this.reverbTone.frequency.value = 2800;
        this.reverbTone.Q.value = 0.35;
        this.reverbGain = this.ctx.createGain();
        this.reverbGain.gain.value = 0.55;
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 18;
        this.compressor.ratio.value = 5;
        this.compressor.attack.value = 0.012;
        this.compressor.release.value = 0.38;
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 128;
        this.analyser.smoothingTimeConstant = 0.8;

        this.musicBus.connect(this.musicLow);
        this.musicLow.connect(this.musicDark);
        this.musicDark.connect(this.master);
        this.sfxBus.connect(this.master);
        this.reverb.connect(this.reverbTone);
        this.reverbTone.connect(this.reverbGain);
        this.reverbGain.connect(this.master);
        this.musicReverbSend = this.ctx.createGain();
        this.musicReverbSend.gain.value = 0.4;
        this.musicDark.connect(this.musicReverbSend);
        this.musicReverbSend.connect(this.reverb);

        this.stringBus = this.ctx.createGain();
        this.stringBus.gain.value = 1.15;
        this.stringBus.connect(this.musicBus);
        this.stringReverb = this.ctx.createGain();
        this.stringReverb.gain.value = 0.5;
        this.stringBus.connect(this.stringReverb);
        this.stringReverb.connect(this.reverb);

        this.keysBus = this.ctx.createGain();
        this.keysBus.gain.value = 0.78;
        this.keysBus.connect(this.musicBus);
        this.keysReverb = this.ctx.createGain();
        this.keysReverb.gain.value = 0.45;
        this.keysBus.connect(this.keysReverb);
        this.keysReverb.connect(this.reverb);

        this.celloBus = this.stringBus;
        this.master.connect(this.compressor);
        this.compressor.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
        this.noiseBuffer = this.createNoise(3.2);

        await this.loadSampleBanks();
        this.applyMixGraph();

        this.nextStepTime = this.ctx.currentTime + 0.12;
        this.startedAt = this.nextStepTime;
        this.stepIndex = 0;
        this.timer = setInterval(() => this.scheduler(), 25);
        this.scheduler();
      }

      createNoise(seconds) {
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < data.length; i++) {
          const white = Math.random() * 2 - 1;
          last = last * 0.88 + white * 0.12;
          data[i] = white * 0.55 + last * 0.45;
        }
        return buffer;
      }

      createImpulse(seconds, decay) {
        const length = Math.floor(this.ctx.sampleRate * seconds);
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        for (let channel = 0; channel < 2; channel++) {
          const data = impulse.getChannelData(channel);
          let dark = 0;
          for (let i = 0; i < length; i++) {
            const envelope = Math.pow(1 - i / length, decay);
            const white = Math.random() * 2 - 1;
            dark = dark * 0.85 + white * 0.15;
            data[i] = (white * 0.22 + dark * 0.78) * envelope;
          }
          [0.045, 0.095, 0.155, 0.245].forEach((delay, index) => {
            const sample = Math.floor(delay * this.ctx.sampleRate);
            if (sample < length) data[sample] += (index % 2 ? -1 : 1) * (0.24 - index * 0.035);
          });
        }
        return impulse;
      }

      distortionCurve(amount = 18) {
        const samples = 2048;
        const curve = new Float32Array(samples);
        const radians = Math.PI / 180;
        for (let i = 0; i < samples; i++) {
          const x = i * 2 / samples - 1;
          curve[i] = (3 + amount) * x * 20 * radians / (Math.PI + amount * Math.abs(x));
        }
        return curve;
      }

      midi(note) {
        return 440 * Math.pow(2, (note - 69) / 12);
      }

      swungTime(step, time) {
        if (this.swing > 0 && step % 4 === 2) return time + this.stepDuration * this.swing;
        return time;
      }

      chordIndexForBar(bar) {
        return Math.floor(bar / 2) % this.chords.length;
      }

      scheduler() {
        if (!this.ctx || this.ctx.state !== "running") return;
        while (this.nextStepTime < this.ctx.currentTime + 0.2) {
          this.scheduleStep(this.stepIndex, this.nextStepTime);
          this.nextStepTime += this.stepDuration;
          this.stepIndex = (this.stepIndex + 1) % this.totalSteps;
          if (this.stepIndex === 0) this.startedAt = this.nextStepTime;
        }
      }

      scheduleStep(index, time) {
        const step = index % 16;
        const dens = this.density || this.styles.gravesong.density;
        const drive = dens.drive ?? 0;
        // Density-driven step grid: full drive = quarters; partial = downbeats + upbeats; default = halves.
        if (drive >= 0.8) {
          if (step % 4 !== 0) return;
        } else if (drive >= 0.4) {
          if (step !== 0 && step !== 4 && step !== 8) return;
        } else if (step !== 0 && step !== 8) {
          return;
        }

        const t = this.swungTime(step, time);
        const bar = Math.floor(index / 16);
        const quarter = step / 4;
        const chordIndex = this.chordIndexForBar(bar);
        const formBoost = this.sections.reduce((acc, s) => (bar >= s.bar ? s.intensity : acc), 0.16);
        const intense = clamp(this.heat * 0.72 + formBoost * 0.28, 0.08, 1);
        const chord = this.chords[chordIndex];
        const root = this.bassRoots[chordIndex];
        const barLen = this.stepDuration * 16.8;
        const halfLen = this.stepDuration * 8.8;
        const isDown = step === 0;
        const harp = dens.harp ?? 0;
        const flute = dens.flute ?? 0;
        const horn = dens.horn ?? 0;
        const subBass = dens.subBass ?? 0;

        if (isDown && dens.organ > 0.35) {
          this.organPad(t, chord, barLen * 1.1, (0.04 + intense * 0.04) * dens.organ);
        }

        // Piano: dense drive styles pulse quarters; sparse styles land every N bars.
        if (drive >= 0.8 && dens.piano > 0.3 && step % 4 === 0) {
          const degree = [0, 7, 12, 7][quarter % 4];
          this.stonePiano(t, chord[0] + degree, (0.06 + intense * 0.04) * dens.piano, halfLen * 0.7);
          if (isDown) this.stonePiano(t, root, (0.08 + intense * 0.03) * dens.piano, barLen * 0.9);
        } else if (isDown && dens.piano > 0.2) {
          const every = dens.piano < 0.38 ? 4 : dens.piano > 0.9 ? 1 : 2;
          if (bar % every === 0) {
            this.stonePiano(t, root, (0.09 + intense * 0.04) * dens.piano, barLen * 1.5);
            this.stonePiano(t, chord[0], (0.05 + intense * 0.03) * dens.piano, barLen * 1.3);
            if (dens.piano >= 0.4) {
              this.stonePiano(t, chord[2], (0.04 + intense * 0.02) * dens.piano, barLen * 1.25);
            }
          }
        }

        // Cello ostinato on halves; high-drive styles may bow shorter quarters.
        const ostinate =
          dens.celloOst > 0 &&
          (step === 0 || step === 8 || (drive >= 0.8 && dens.celloOst >= 0.9 && step % 4 === 0));
        if (ostinate) {
          const oSlot = (bar * 2 + (step >= 8 ? 1 : 0) + Math.floor(quarter / 2)) % this.celloOstinato.length;
          const note = root + this.celloOstinato[oSlot];
          const len = drive >= 0.8 && step % 4 !== 0 ? this.stepDuration * 3.8 : halfLen * 1.05;
          this.cello(t, note, (0.13 + intense * 0.1) * dens.celloOst, len, {
            attack: drive >= 0.8 ? 0.1 : 0.2,
            brightness: 0.1 + intense * 0.1
          });
          if ((isDown || step === 8) && subBass > 0.2) {
            this.cello(t, note - 12, (0.07 + intense * 0.05) * dens.celloOst * subBass, halfLen * 1.08, {
              attack: 0.26,
              brightness: 0.06,
              bowNoise: 0.006
            });
          }
        }

        if (isDown && dens.celloMel > 0.3) {
          const mel = this.celloMelody[bar % this.celloMelody.length];
          this.cello(t, mel, (0.11 + intense * 0.08) * dens.celloMel, barLen * 1.05, {
            attack: 0.2,
            vibrato: 2.8,
            vibratoDepth: 3.2 + intense * 2,
            brightness: 0.14 + intense * 0.1
          });
        }

        const violinOn =
          (intense > dens.violin * 0.55 && isDown) ||
          (intense > dens.halfViolin && (step === 8 || (drive >= 0.8 && step === 4)));
        if (violinOn) {
          const v = this.violinMelody[(bar + (step >= 8 ? 4 : 0)) % this.violinMelody.length];
          const len = isDown ? barLen * 0.95 : halfLen;
          this.violin(t, v, (0.045 + intense * 0.05) * Math.max(0.5, dens.violin), len, {
            attack: 0.16,
            vibrato: 3.4,
            vibratoDepth: 3.5,
            brightness: 0.16 + intense * 0.1
          });
        }

        // Color layers from free sample bank — driven by style density (not hard-coded ids).
        if (isDown) {
          const color = chord[1] + 12;
          if (harp > 0.2) {
            const every = Math.max(2, Math.round(6 - harp * 4));
            if (bar % every === 0) {
              this.playSample("harp", color, t, barLen * 0.85, (0.028 + intense * 0.028) * harp, {
                bus: "keys", attack: 0.02, release: 0.9, filterHz: 4800
              });
            }
          }
          if (flute > 0.25 && intense > 0.28) {
            const every = Math.max(2, Math.round(5 - flute * 3));
            if (bar % every === 1) {
              this.playSample("flute", this.violinMelody[bar % this.violinMelody.length], t, halfLen, (0.025 + intense * 0.022) * flute, {
                bus: "string", attack: 0.12, release: 0.7, filterHz: 4200
              });
            }
          }
          if (horn > 0.25) {
            const every = Math.max(2, Math.round(5 - horn * 2.5));
            if (bar % every === 2) {
              this.playSample("french-horn", root + 12, t, barLen * 0.9, (0.03 + intense * 0.028) * horn, {
                bus: "string", attack: 0.2, release: 0.8, filterHz: 2800
              });
            }
          }
        }
      }

      connect(node) {
        node.connect(this.musicBus || this.master);
      }

      connectString(node) {
        if (this.stringBus) node.connect(this.stringBus);
        else this.connect(node);
      }

      connectKeys(node) {
        if (this.keysBus) node.connect(this.keysBus);
        else this.connect(node);
      }

      connectCello(node) {
        this.connectString(node);
      }

      cello(time, note, velocity, duration, {
        vibrato = 2.6,
        vibratoDepth = 3,
        brightness = 0.12,
        bowNoise = 0.012,
        attack = 0.2
      } = {}) {
        if (!this.ctx) return;
        // Prefer real cello. Sub-bass only when style density asks for weight.
        const hit = this.playSample("cello", note, time, duration, velocity, {
          bus: "string",
          attack: Math.max(0.06, attack * 0.55),
          release: 0.55,
          filterHz: 0
        });
        if (hit) {
          const sub = this.density?.subBass ?? 1;
          if (sub > 0.15 && note >= 36) {
            this.playSample("contrabass", note - 12, time, duration * 1.05, velocity * 0.35 * sub, {
              bus: "string",
              attack: 0.12,
              release: 0.65
            });
          }
          return;
        }
        const freq = this.midi(note);
        const stopAt = time + duration + 0.12;
        const filter = this.ctx.createBiquadFilter();
        const formant1 = this.ctx.createBiquadFilter();
        const formant2 = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();

        filter.type = "lowpass";
        filter.Q.value = 0.6;
        const open = 400 + brightness * 320;
        const close = 200 + brightness * 140;
        filter.frequency.setValueAtTime(close * 0.65, time);
        filter.frequency.exponentialRampToValueAtTime(Math.max(160, open), time + Math.min(0.4, duration * 0.22));
        filter.frequency.exponentialRampToValueAtTime(Math.max(130, close), time + duration * 0.9);

        formant1.type = "peaking";
        formant1.frequency.value = clamp(freq * 1.35, 160, 300);
        formant1.Q.value = 1.15;
        formant1.gain.value = 6;
        formant2.type = "peaking";
        formant2.frequency.value = clamp(freq * 2.2, 280, 480);
        formant2.Q.value = 0.85;
        formant2.gain.value = 3.5;

        const bowAttack = Math.max(0.1, attack);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(velocity, time + bowAttack);
        gain.gain.setValueAtTime(velocity * 0.97, time + duration * 0.78);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.type = "sine";
        lfo.frequency.value = vibrato;
        lfoGain.gain.value = vibratoDepth;
        lfo.connect(lfoGain);

        const layers = [
          { type: "sine", ratio: 0.5, level: 0.62, detune: 0 },
          { type: "sine", ratio: 1, level: 0.95, detune: 0 },
          { type: "triangle", ratio: 1, level: 0.32, detune: -3 },
          { type: "sine", ratio: 2, level: 0.1, detune: 2 },
          { type: "sawtooth", ratio: 1, level: 0.045 + brightness * 0.05, detune: 1 }
        ];
        layers.forEach((layer) => {
          const osc = this.ctx.createOscillator();
          const mix = this.ctx.createGain();
          const f = Math.max(20, freq * layer.ratio);
          osc.type = layer.type;
          osc.frequency.setValueAtTime(f * 0.996, time);
          osc.frequency.exponentialRampToValueAtTime(f, time + Math.min(0.14, bowAttack));
          osc.detune.value = layer.detune;
          lfoGain.connect(osc.detune);
          mix.gain.value = layer.level;
          osc.connect(mix);
          mix.connect(filter);
          osc.start(time);
          osc.stop(stopAt);
          this.trackMusicVoice(osc, mix);
        });
        this.trackMusicVoice(lfo, gain);

        if (bowNoise > 0.001 && this.noiseBuffer) {
          const noise = this.ctx.createBufferSource();
          const nFilter = this.ctx.createBiquadFilter();
          const nGain = this.ctx.createGain();
          noise.buffer = this.noiseBuffer;
          noise.loop = true;
          nFilter.type = "bandpass";
          nFilter.frequency.value = 620;
          nFilter.Q.value = 0.5;
          nGain.gain.setValueAtTime(0.0001, time);
          nGain.gain.linearRampToValueAtTime(bowNoise * velocity, time + bowAttack);
          nGain.gain.exponentialRampToValueAtTime(0.0001, time + duration * 0.92);
          noise.connect(nFilter);
          nFilter.connect(nGain);
          nGain.connect(filter);
          noise.start(time);
          noise.stop(stopAt);
          this.trackMusicVoice(noise, nGain);
        }

        const shaper = this.ctx.createWaveShaper();
        shaper.curve = this.distortionCurve(5);
        shaper.oversample = "2x";
        filter.connect(formant1);
        formant1.connect(formant2);
        formant2.connect(shaper);
        shaper.connect(gain);
        this.connectString(gain);
        lfo.start(time);
        lfo.stop(stopAt);
      }

      violin(time, note, velocity, duration, opts = {}) {
        if (!this.ctx) return;
        const attack = opts.attack ?? 0.12;
        if (this.playSample("violin", note, time, duration, velocity, {
          bus: "string",
          attack: Math.max(0.05, attack * 0.6),
          release: 0.5,
          filterHz: 5200
        })) return;
        // Soft mid-register fallback (never bright toy synth)
        this.playSample("cello", note, time, duration, velocity * 0.7, {
          bus: "string",
          attack: 0.1,
          release: 0.45
        });
      }

      organPad(time, notes, duration, velocity) {
        if (!this.ctx) return;
        let any = false;
        notes.forEach((note, i) => {
          const vel = velocity * (i === 0 ? 1 : 0.7);
          if (this.playSample("organ", note, time, duration, vel, {
            bus: "keys",
            attack: 0.35,
            release: 0.8,
            filterHz: 2400
          })) any = true;
          if (this.playSample("organ", note - 12, time, duration, vel * 0.55, {
            bus: "keys",
            attack: 0.4,
            release: 0.85,
            filterHz: 1800
          })) any = true;
        });
        if (any) return;
        // Minimal dark pad fallback if samples failed to load
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        filter.type = "lowpass";
        filter.frequency.value = 700;
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.linearRampToValueAtTime(velocity, time + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        filter.connect(gain);
        this.connectKeys(gain);
        notes.forEach((note) => {
          const osc = this.ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = this.midi(note);
          osc.connect(filter);
          osc.start(time);
          osc.stop(time + duration + 0.05);
          this.trackMusicVoice(osc, gain);
        });
      }

      stonePiano(time, note, velocity, duration) {
        if (!this.ctx) return;
        if (this.playSample("piano", note, time, duration, velocity, {
          bus: "keys",
          attack: 0.01,
          release: Math.min(1.2, duration * 0.55),
          filterHz: 3600
        })) return;
        if (this.playSample("piano", Math.max(21, note - 12), time, duration, velocity * 0.5, {
          bus: "keys",
          attack: 0.01,
          release: 0.9
        })) return;
      }

      piano(time, note, velocity, duration) {
        this.stonePiano(time, note, velocity, duration);
      }

      keyboard(time, note, velocity, duration) {
        this.organPad(time, [note], duration, velocity);
      }

      keyboardChord(time, notes, duration, velocity) {
        this.organPad(time, notes, duration, velocity);
      }

      leadVoice(time, note, duration, velocity) {
        this.cello(time, note, velocity, duration);
      }

      bass(time, note, duration, velocity) {
        this.cello(time, note, velocity * 0.9, duration, { attack: 0.12, brightness: 0.08 });
      }

      brassStab() {}

      pad(time, notes, duration, velocity) {
        this.organPad(time, notes, duration, velocity);
      }

      pluck(time, note, velocity, duration) {
        this.stonePiano(time, note, velocity, duration * 0.7);
      }

      riserTick() {}

      connectSfx(node, { reverb = 0.16, pan = 0, dry = 1 } = {}) {
        let output = node;
        if (this.ctx.createStereoPanner) {
          const panner = this.ctx.createStereoPanner();
          panner.pan.value = clamp(pan, -1, 1);
          node.connect(panner);
          output = panner;
        }
        const dryGain = this.ctx.createGain();
        dryGain.gain.value = dry;
        output.connect(dryGain);
        dryGain.connect(this.sfxBus || this.master);
        if (this.reverb && reverb > 0) {
          const send = this.ctx.createGain();
          send.gain.value = reverb;
          output.connect(send);
          send.connect(this.reverb);
        }
      }

      duckMusic(amount = 0.22, duration = 0.5) {
        if (!this.musicBus || !this.ctx) return;
        const now = this.ctx.currentTime;
        const gain = this.musicBus.gain;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(Math.min(this.musicLevel, Math.max(0.16, gain.value)), now);
        gain.linearRampToValueAtTime(this.musicLevel * (1 - amount), now + 0.018);
        gain.exponentialRampToValueAtTime(this.musicLevel, now + duration);
      }

      noiseBurst(time, {
        duration = 0.3,
        gain = 0.2,
        attack = 0.004,
        filter = "bandpass",
        frequency = 1600,
        endFrequency = 240,
        q = 0.8,
        playbackRate = 1,
        drive = 0,
        pan = 0,
        reverb = 0.16,
        dry = 1
      } = {}) {
        const source = this.ctx.createBufferSource();
        const tone = this.ctx.createBiquadFilter();
        const envelope = this.ctx.createGain();
        source.buffer = this.noiseBuffer;
        source.playbackRate.value = playbackRate;
        tone.type = filter;
        tone.Q.value = q;
        tone.frequency.setValueAtTime(Math.max(30, frequency), time);
        tone.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), time + duration);
        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + Math.max(0.002, attack));
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        source.connect(tone);
        if (drive > 0) {
          const shaper = this.ctx.createWaveShaper();
          shaper.curve = this.distortionCurve(drive);
          shaper.oversample = "2x";
          tone.connect(shaper);
          shaper.connect(envelope);
        } else {
          tone.connect(envelope);
        }
        this.connectSfx(envelope, { reverb, pan, dry });
        const available = Math.max(0, this.noiseBuffer.duration - duration - 0.02);
        source.start(time, Math.random() * Math.min(1.1, available), duration + 0.01);
        source.stop(time + duration + 0.025);
      }

      toneSweep(time, {
        from = 180,
        to = 48,
        duration = 0.3,
        gain = 0.14,
        type = "sine",
        attack = 0.004,
        pan = 0,
        reverb = 0.08,
        dry = 1
      } = {}) {
        const oscillator = this.ctx.createOscillator();
        const envelope = this.ctx.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(Math.max(20, from), time);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, to), time + duration);
        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + Math.max(0.002, attack));
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
        oscillator.connect(envelope);
        this.connectSfx(envelope, { reverb, pan, dry });
        oscillator.start(time);
        oscillator.stop(time + duration + 0.025);
      }

      /** Steel impact — low body first, not a tinny coin ding. */
      metalStrike(time, pitch = 620, gain = 0.12, pan = 0, reverb = 0.22) {
        // Partial stack biased toward lower metal (sword / dagger / plate).
        [1, 1.51, 2.12, 2.74].forEach((ratio, index) => {
          const oscillator = this.ctx.createOscillator();
          const filter = this.ctx.createBiquadFilter();
          const envelope = this.ctx.createGain();
          const duration = 0.08 + index * 0.07;
          oscillator.type = index === 0 ? "triangle" : "sine";
          const f0 = Math.max(55, pitch * ratio);
          oscillator.frequency.setValueAtTime(f0, time);
          oscillator.frequency.exponentialRampToValueAtTime(f0 * 0.82, time + duration);
          filter.type = "lowpass";
          filter.frequency.value = 1800 + index * 400;
          filter.Q.value = 0.7;
          envelope.gain.setValueAtTime(gain / Math.pow(index + 1, 1.35), time);
          envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
          oscillator.connect(filter);
          filter.connect(envelope);
          this.connectSfx(envelope, { reverb, pan, dry: 0.9 });
          oscillator.start(time);
          oscillator.stop(time + duration + 0.02);
        });
        // Transient scrape so it reads as steel, not a beep.
        this.noiseBurst(time, {
          duration: 0.045,
          gain: gain * 0.55,
          attack: 0.001,
          filter: "bandpass",
          frequency: Math.min(2400, pitch * 2.2),
          endFrequency: 280,
          q: 1.1,
          drive: 10,
          pan,
          reverb: reverb * 0.5
        });
      }

      /** Blade / body whoosh — mid-dark air, never a cartoon whistle. */
      whoosh(time, duration = 0.24, from = 280, to = 1400, gain = 0.16, pan = 0, reverb = 0.14) {
        this.noiseBurst(time, {
          duration,
          gain,
          attack: Math.max(0.008, duration * 0.18),
          filter: "bandpass",
          frequency: from,
          endFrequency: to,
          q: 0.55,
          playbackRate: 0.55 + Math.random() * 0.22,
          pan,
          reverb
        });
      }

      /** Low hextech hum (power-ups / shields) — no ascending jingle. */
      hexPulse(time, {
        from = 96,
        to = 48,
        duration = 0.32,
        gain = 0.1,
        pan = 0,
        reverb = 0.28
      } = {}) {
        this.toneSweep(time, {
          from,
          to,
          duration,
          gain,
          type: "sine",
          attack: 0.012,
          pan,
          reverb
        });
        this.toneSweep(time, {
          from: from * 1.5,
          to: to * 1.2,
          duration: duration * 0.85,
          gain: gain * 0.35,
          type: "triangle",
          attack: 0.02,
          pan: -pan * 0.6,
          reverb: reverb * 0.8,
          dry: 0.7
        });
      }

      kick(time, velocity) {
        const osc = this.ctx.createOscillator();
        const click = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const clickGain = this.ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(118, time);
        osc.frequency.exponentialRampToValueAtTime(41, time + 0.16);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.58 * velocity, time + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
        click.type = "triangle";
        click.frequency.setValueAtTime(920, time);
        click.frequency.exponentialRampToValueAtTime(120, time + 0.03);
        clickGain.gain.setValueAtTime(0.08 * velocity, time);
        clickGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.035);
        osc.connect(gain);
        click.connect(clickGain);
        this.connect(gain);
        this.connect(clickGain);
        osc.start(time);
        click.start(time);
        osc.stop(time + 0.34);
        click.stop(time + 0.04);
      }

      snare(time, velocity) {
        const src = this.ctx.createBufferSource();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        src.buffer = this.noiseBuffer;
        filter.type = "bandpass";
        filter.frequency.value = 2400;
        filter.Q.value = 0.55;
        gain.gain.setValueAtTime(velocity * 0.85, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.14);
        src.connect(filter);
        filter.connect(gain);
        this.connect(gain);
        src.start(time);
        src.stop(time + 0.16);

        const body = this.ctx.createOscillator();
        const bodyGain = this.ctx.createGain();
        body.type = "triangle";
        body.frequency.setValueAtTime(210, time);
        body.frequency.exponentialRampToValueAtTime(98, time + 0.08);
        bodyGain.gain.setValueAtTime(0.14 * velocity, time);
        bodyGain.gain.exponentialRampToValueAtTime(0.0001, time + 0.11);
        body.connect(bodyGain);
        this.connect(bodyGain);
        body.start(time);
        body.stop(time + 0.12);
      }

      hat(time, velocity, open) {
        const src = this.ctx.createBufferSource();
        const high = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        src.buffer = this.noiseBuffer;
        // Ride-ish shimmer when open; tight stick when closed.
        high.type = open ? "bandpass" : "highpass";
        high.frequency.value = open ? 5200 : 8200;
        high.Q.value = open ? 0.45 : 0.7;
        gain.gain.setValueAtTime(velocity, time);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + (open ? 0.22 : 0.032));
        src.connect(high);
        high.connect(gain);
        this.connect(gain);
        src.start(time, Math.random() * 0.4);
        src.stop(time + (open ? 0.24 : 0.04));
      }

      effect(type, strength = 1) {
        if (!this.ctx || this.ctx.state !== "running") return;
        const time = this.ctx.currentTime;
        const name = type === "ult" ? "deathLotus" : type;
        const randomPan = () => (Math.random() * 2 - 1) * 0.52;
        // Combat SFX also push suite heat so BPM/layers answer the fight.
        const heatPulse = {
          bomb: 0.12, pickup: 0.04, hit: 0.16, bladeHit: 0.14, kill: 0.28,
          dash: 0.1, shunpo: 0.18, deathLotus: 0.32, deathMark: 0.28, markPop: 0.3,
          dominus: 0.3, hemoplague: 0.22, hemoplaguePop: 0.3, cannonBarrage: 0.28,
          barrelBoom: 0.24, voracity: 0.16, shield: 0.08
        };
        this.pulseAction((heatPulse[name] ?? 0.1) * clamp(strength, 0.5, 1.4));

        if (name === "bomb") {
          this.duckMusic(0.08, 0.22);
          this.toneSweep(time, { from: 92, to: 38, duration: 0.16, gain: 0.14 * strength, type: "sine", reverb: 0.06 });
          this.noiseBurst(time, { duration: 0.07, gain: 0.14 * strength, filter: "bandpass", frequency: 900, endFrequency: 220, q: 0.6, drive: 12, reverb: 0.1 });
          this.metalStrike(time + 0.01, 480, 0.05 * strength, randomPan(), 0.1);
        } else if (name === "pickup") {
          // Hextech absorb — low hum + soft plate, NEVER ascending coin jingle.
          this.hexPulse(time, { from: 88, to: 42, duration: 0.38, gain: 0.09 * strength, pan: -0.12, reverb: 0.32 });
          this.noiseBurst(time, { duration: 0.08, gain: 0.07 * strength, filter: "bandpass", frequency: 700, endFrequency: 180, q: 0.8, drive: 6, reverb: 0.2 });
          this.metalStrike(time + 0.04, 360, 0.045 * strength, 0.18, 0.28);
        } else if (name === "hit" || name === "bladeHit") {
          this.duckMusic(0.18, 0.36);
          this.toneSweep(time, { from: 88, to: 32, duration: 0.28, gain: 0.22 * strength, type: "sine", reverb: 0.06 });
          this.noiseBurst(time, {
            duration: 0.16,
            gain: 0.2 * strength,
            filter: "bandpass",
            frequency: name === "bladeHit" ? 1100 : 620,
            endFrequency: 140,
            q: 0.85,
            drive: 18,
            pan: randomPan(),
            reverb: 0.12
          });
          if (name === "bladeHit") this.metalStrike(time, 540, 0.09 * strength, randomPan(), 0.14);
        } else if (name === "kill") {
          this.duckMusic(0.34, 0.9);
          this.toneSweep(time, { from: 70, to: 22, duration: 0.82, gain: 0.3, type: "sine", reverb: 0.22 });
          this.noiseBurst(time, { duration: 0.42, gain: 0.24, filter: "lowpass", frequency: 900, endFrequency: 70, q: 0.55, drive: 22, reverb: 0.32 });
          [420, 310, 240].forEach((pitch, index) => this.metalStrike(time + index * 0.07, pitch, 0.06, index % 2 ? 0.25 : -0.25, 0.4));
        } else if (name === "dash") {
          this.whoosh(time, 0.2, 220, 1100, 0.15 * strength, randomPan(), 0.1);
          this.toneSweep(time, { from: 110, to: 48, duration: 0.14, gain: 0.05, type: "sine", pan: randomPan(), reverb: 0.08 });
        } else if (name === "katQ") {
          // Bouncing Blade throw: steel spin + body whoosh (not a laser peep).
          this.whoosh(time, 0.22, 240, 980, 0.16, -0.32, 0.12);
          this.metalStrike(time + 0.03, 620, 0.1, 0.28, 0.16);
          this.noiseBurst(time + 0.02, { duration: 0.12, gain: 0.08, filter: "bandpass", frequency: 1400, endFrequency: 320, q: 0.9, drive: 8, pan: 0.2, reverb: 0.14 });
        } else if (name === "katW") {
          // Preparation: tense air + soft steel — no sparkle cascade.
          this.whoosh(time, 0.32, 180, 720, 0.12, 0, 0.2);
          this.hexPulse(time, { from: 72, to: 46, duration: 0.4, gain: 0.07, reverb: 0.28 });
          this.metalStrike(time + 0.14, 400, 0.06, -0.15, 0.24);
        } else if (name === "shunpo") {
          // Blink: vacuum snap + body reappear, not a cartoon zip.
          this.duckMusic(0.14, 0.32);
          this.noiseBurst(time, { duration: 0.09, gain: 0.18, filter: "lowpass", frequency: 1400, endFrequency: 120, q: 0.5, drive: 14, pan: -0.4, reverb: 0.12 });
          this.whoosh(time + 0.02, 0.16, 900, 200, 0.14, 0.45, 0.14);
          this.toneSweep(time, { from: 160, to: 40, duration: 0.2, gain: 0.12, type: "sine", reverb: 0.1 });
          this.metalStrike(time + 0.06, 480, 0.07, 0.15, 0.16);
        } else if (name === "zedQ") {
          this.whoosh(time, 0.2, 260, 1200, 0.16, -0.28, 0.1);
          this.metalStrike(time + 0.03, 520, 0.09, -0.1, 0.14);
          this.toneSweep(time, { from: 140, to: 48, duration: 0.24, gain: 0.08, type: "triangle", reverb: 0.14, dry: 0.8 });
        } else if (name === "zedW" || name === "zedSwap") {
          this.duckMusic(name === "zedSwap" ? 0.16 : 0.1, 0.3);
          this.whoosh(time, 0.28, name === "zedSwap" ? 1100 : 220, name === "zedSwap" ? 160 : 900, 0.16, -0.4, 0.22);
          this.toneSweep(time, { from: 78, to: 30, duration: 0.3, gain: 0.11, type: "sine", reverb: 0.32 });
        } else if (name === "zedE") {
          this.duckMusic(0.14, 0.36);
          for (let i = 0; i < 3; i++) {
            this.whoosh(time + i * 0.032, 0.2, 280 + i * 120, 900 - i * 80, 0.12, i % 2 ? 0.5 : -0.5, 0.12);
          }
          this.metalStrike(time + 0.05, 440, 0.09, 0, 0.16);
          this.toneSweep(time, { from: 100, to: 36, duration: 0.32, gain: 0.12, type: "sine", reverb: 0.12 });
        } else if (name === "deathMark") {
          this.duckMusic(0.26, 1.0);
          this.whoosh(time, 0.38, 200, 900, 0.2, -0.4, 0.28);
          this.toneSweep(time, { from: 80, to: 26, duration: 1.1, gain: 0.18, type: "sine", reverb: 0.4 });
          [520, 380, 280].forEach((pitch, index) => this.metalStrike(time + 0.06 + index * 0.05, pitch, 0.05, index % 2 ? 0.3 : -0.3, 0.4));
        } else if (name === "markPop") {
          this.duckMusic(0.36, 0.82);
          this.noiseBurst(time, { duration: 0.3, gain: 0.24, filter: "bandpass", frequency: 900, endFrequency: 100, q: 0.65, drive: 22, reverb: 0.28 });
          this.toneSweep(time, { from: 100, to: 22, duration: 0.68, gain: 0.28, type: "sine", reverb: 0.3 });
          [480, 340, 260].forEach((pitch, index) => this.metalStrike(time + index * 0.025, pitch, 0.08, index % 2 ? 0.4 : -0.4, 0.32));
        } else if (name === "daggerLand") {
          this.metalStrike(time, 520, 0.08, randomPan(), 0.18);
          this.noiseBurst(time, { duration: 0.07, gain: 0.06, filter: "bandpass", frequency: 1600, endFrequency: 280, q: 0.7, drive: 7, pan: randomPan(), reverb: 0.12 });
        } else if (name === "voracity") {
          this.duckMusic(0.16, 0.45);
          for (let i = 0; i < 3; i++) {
            const pan = i % 2 ? 0.55 : -0.55;
            this.whoosh(time + i * 0.055, 0.22, 260 + i * 90, 980 - i * 100, 0.14, pan, 0.14);
            this.metalStrike(time + 0.04 + i * 0.055, 480 + i * 70, 0.065, -pan * 0.6, 0.18);
          }
          this.toneSweep(time, { from: 100, to: 40, duration: 0.36, gain: 0.11, type: "sine", reverb: 0.12 });
        } else if (name === "renektonQ" || name === "renektonQEmpowered") {
          const empowered = name.endsWith("Empowered");
          this.duckMusic(empowered ? 0.22 : 0.14, 0.5);
          for (let i = 0; i < (empowered ? 4 : 3); i++) {
            this.whoosh(time + i * 0.04, 0.26, 200 + i * 100, 900 - i * 80,
              (empowered ? 0.17 : 0.13), i % 2 ? 0.55 : -0.55, 0.14);
          }
          this.metalStrike(time + 0.07, empowered ? 320 : 420, empowered ? 0.13 : 0.09, 0, 0.18);
          this.toneSweep(time, { from: empowered ? 110 : 95, to: 30, duration: empowered ? 0.48 : 0.34,
            gain: empowered ? 0.18 : 0.12, type: "sine", reverb: 0.14 });
        } else if (name === "renektonW" || name === "renektonWEmpowered") {
          const empowered = name.endsWith("Empowered");
          this.duckMusic(empowered ? 0.28 : 0.18, 0.55);
          this.whoosh(time, 0.18, 900, 180, empowered ? 0.2 : 0.15, -0.28, 0.1);
          this.noiseBurst(time + 0.045, { duration: empowered ? 0.28 : 0.2, gain: empowered ? 0.22 : 0.16,
            filter: "bandpass", frequency: 700, endFrequency: 100, q: 0.7, drive: 18, reverb: 0.14 });
          [280, 360, 440].forEach((pitch, index) =>
            this.metalStrike(time + 0.04 + index * 0.032, pitch, (empowered ? 0.085 : 0.06), index % 2 ? 0.35 : -0.35, 0.16));
        } else if (name === "renektonE" || name === "renektonDice") {
          const second = name === "renektonDice";
          this.whoosh(time, second ? 0.28 : 0.22, second ? 1000 : 240, second ? 180 : 900,
            second ? 0.18 : 0.14, -0.45, 0.12);
          this.whoosh(time + 0.03, 0.2, 200, 800, second ? 0.14 : 0.1, 0.45, 0.1);
          this.noiseBurst(time, { duration: 0.2, gain: second ? 0.1 : 0.07, filter: "bandpass",
            frequency: 1100, endFrequency: 220, q: 0.55, drive: 8, reverb: 0.12 });
        } else if (name === "dominus") {
          this.duckMusic(0.32, 1.2);
          this.toneSweep(time, { from: 90, to: 22, duration: 1.15, gain: 0.28, type: "sine", reverb: 0.38 });
          this.noiseBurst(time, { duration: 0.95, gain: 0.2, filter: "lowpass", frequency: 1100,
            endFrequency: 70, q: 0.5, drive: 16, reverb: 0.42 });
          [280, 220, 170].forEach((pitch, index) => this.metalStrike(time + 0.07 + index * 0.1, pitch, 0.07, 0, 0.4));
        } else if (name === "vladimirQ" || name === "vladimirQEmpowered") {
          const empowered = name.endsWith("Empowered");
          this.whoosh(time, empowered ? 0.38 : 0.28, empowered ? 900 : 500, 140,
            empowered ? 0.18 : 0.12, -0.28, 0.22);
          this.toneSweep(time, { from: empowered ? 82 : 100, to: empowered ? 36 : 52,
            duration: empowered ? 0.48 : 0.3, gain: empowered ? 0.16 : 0.1, type: "sine", reverb: 0.32 });
          this.noiseBurst(time + 0.04, { duration: 0.2, gain: empowered ? 0.14 : 0.08,
            filter: "bandpass", frequency: 600, endFrequency: 120, q: 0.9, drive: 10, reverb: 0.24 });
        } else if (name === "sanguinePool") {
          this.duckMusic(0.16, 0.7);
          this.whoosh(time, 0.5, 400, 80, 0.16, 0, 0.36);
          this.noiseBurst(time, { duration: 0.85, gain: 0.16, filter: "lowpass", frequency: 520,
            endFrequency: 60, q: 0.6, playbackRate: 0.55, drive: 10, reverb: 0.42 });
          this.toneSweep(time, { from: 70, to: 28, duration: 0.75, gain: 0.14, type: "sine", reverb: 0.4 });
        } else if (name === "tidesOfBlood") {
          this.duckMusic(0.2, 0.52);
          for (let i = 0; i < 4; i++) {
            this.whoosh(time + i * 0.024, 0.24, 220 + i * 140, 700 - i * 60,
              0.12, i % 2 ? 0.55 : -0.55, 0.16);
          }
          this.toneSweep(time, { from: 100, to: 34, duration: 0.42, gain: 0.16, type: "sine", reverb: 0.2 });
        } else if (name === "gangplankQ") {
          this.whoosh(time, 0.18, 700, 220, 0.13, -0.22, 0.1);
          this.metalStrike(time + 0.025, 380, 0.07, 0.15, 0.12);
          this.noiseBurst(time + 0.015, { duration: 0.1, gain: 0.07, filter: "bandpass", frequency: 900, endFrequency: 200, q: 0.6, drive: 7, reverb: 0.1 });
        } else if (name === "removeScurvy") {
          this.duckMusic(0.1, 0.36);
          this.whoosh(time, 0.28, 400, 100, 0.11, 0, 0.2);
          this.hexPulse(time, { from: 90, to: 50, duration: 0.36, gain: 0.08, reverb: 0.28 });
        } else if (name === "powderKeg") {
          this.noiseBurst(time, { duration: 0.15, gain: 0.1, filter: "lowpass", frequency: 600, endFrequency: 120, q: 0.65, drive: 9, reverb: 0.14 });
          this.metalStrike(time + 0.03, 220, 0.07, 0, 0.12);
        } else if (name === "barrelBoom") {
          this.duckMusic(0.26, 0.65);
          this.noiseBurst(time, { duration: 0.38, gain: 0.26, filter: "bandpass", frequency: 700, endFrequency: 70, q: 0.5, drive: 22, reverb: 0.32 });
          this.toneSweep(time, { from: 82, to: 24, duration: 0.55, gain: 0.2, type: "sine", reverb: 0.26 });
          [280, 210, 160].forEach((pitch, index) => this.metalStrike(time + index * 0.035, pitch, 0.08, index % 2 ? 0.35 : -0.35, 0.26));
        } else if (name === "cannonBarrage") {
          this.duckMusic(0.3, 1.0);
          this.whoosh(time, 0.42, 600, 70, 0.16, -0.35, 0.3);
          for (let i = 0; i < 6; i++) {
            this.noiseBurst(time + 0.1 + i * 0.1, { duration: 0.18, gain: 0.14, filter: "bandpass", frequency: 800 - i * 60, endFrequency: 90, q: 0.55, drive: 14, reverb: 0.24, pan: i % 2 ? 0.45 : -0.45 });
          }
          this.toneSweep(time, { from: 72, to: 22, duration: 0.95, gain: 0.18, type: "sine", reverb: 0.36 });
        } else if (name === "hemoplague") {
          this.duckMusic(0.2, 0.75);
          this.whoosh(time, 0.52, 160, 700, 0.14, 0, 0.34);
          this.toneSweep(time, { from: 64, to: 36, duration: 0.95, gain: 0.14, type: "sine", reverb: 0.42 });
          [240, 300, 360].forEach((pitch, index) => this.metalStrike(time + index * 0.07, pitch, 0.04, index % 2 ? 0.35 : -0.35, 0.45));
        } else if (name === "hemoplaguePop") {
          this.duckMusic(0.34, 0.9);
          this.noiseBurst(time, { duration: 0.42, gain: 0.26, filter: "bandpass", frequency: 700,
            endFrequency: 70, q: 0.6, drive: 20, reverb: 0.36 });
          this.toneSweep(time, { from: 92, to: 20, duration: 0.72, gain: 0.28, type: "sine", reverb: 0.36 });
          this.whoosh(time, 0.38, 700, 90, 0.16, 0, 0.28);
        } else if (name === "shield") {
          this.duckMusic(0.1, 0.4);
          this.hexPulse(time, { from: 70, to: 44, duration: 0.4, gain: 0.1, reverb: 0.36 });
          this.noiseBurst(time, { duration: 0.18, gain: 0.08, filter: "bandpass", frequency: 900, endFrequency: 220, q: 0.7, drive: 6, reverb: 0.28 });
          this.metalStrike(time + 0.05, 280, 0.05, 0, 0.32);
        } else if (name === "deathLotus") {
          // Death Lotus: spinning steel storm — weight and blades, not laser peeps.
          this.duckMusic(0.28, 1.7);
          this.toneSweep(time, { from: 90, to: 28, duration: 1.5, gain: 0.18, type: "sine", reverb: 0.28 });
          for (let i = 0; i < 11; i++) {
            const offset = i * 0.12;
            const pan = i % 2 ? 0.62 : -0.62;
            this.whoosh(time + offset, 0.18, 220 + (i % 3) * 80, 900 - (i % 4) * 60, 0.1, pan, 0.16);
            if (i % 2 === 0) this.metalStrike(time + offset + 0.025, 380 + (i % 4) * 55, 0.055, -pan * 0.7, 0.22);
          }
        }
      }

      explosion(strength = 1) {
        if (!this.ctx || this.ctx.state !== "running") return;
        const time = this.ctx.currentTime;
        this.pulseAction(0.2 + clamp(strength, 0.5, 1.2) * 0.12);
        this.duckMusic(clamp(0.31 + strength * 0.08, 0.34, 0.43), 1.28);

        // Initial supersonic crack and pressure front.
        this.noiseBurst(time, {
          duration: 0.105,
          gain: 0.29 * strength,
          attack: 0.0015,
          filter: "highpass",
          frequency: 7800,
          endFrequency: 920,
          q: 0.46,
          drive: 22,
          reverb: 0.34
        });
        this.toneSweep(time, { from: 152, to: 38, duration: 0.46, gain: 0.2 * strength, type: "triangle", reverb: 0.11 });

        // Low-frequency body, distorted fireball and long environmental tail.
        this.toneSweep(time + 0.006, { from: 76, to: 23, duration: 1.05, gain: 0.34 * strength, type: "sine", reverb: 0.22 });
        this.noiseBurst(time + 0.008, {
          duration: 1.16,
          gain: 0.34 * strength,
          attack: 0.012,
          filter: "lowpass",
          frequency: 2600,
          endFrequency: 72,
          q: 0.68,
          playbackRate: 0.74,
          drive: 24,
          reverb: 0.46,
          dry: 0.9
        });
        this.noiseBurst(time + 0.07, {
          duration: 0.82,
          gain: 0.14 * strength,
          attack: 0.035,
          filter: "bandpass",
          frequency: 1180,
          endFrequency: 155,
          q: 0.52,
          playbackRate: 0.58,
          reverb: 0.58,
          dry: 0.58
        });

        // Stone, timber and metal fragments disperse across the stereo field.
        for (let i = 0; i < 7; i++) {
          const delay = 0.11 + i * 0.065 + Math.random() * 0.055;
          const pan = (i / 6) * 1.5 - 0.75 + (Math.random() - 0.5) * 0.18;
          this.noiseBurst(time + delay, {
            duration: 0.075 + Math.random() * 0.14,
            gain: (0.055 + Math.random() * 0.045) * strength,
            attack: 0.002,
            filter: "bandpass",
            frequency: 900 + Math.random() * 2800,
            endFrequency: 180 + Math.random() * 380,
            q: 1.1 + Math.random() * 1.4,
            playbackRate: 0.82 + Math.random() * 0.52,
            drive: 8,
            pan,
            reverb: 0.3 + Math.random() * 0.22
          });
        }
      }

      toggleMute() {
        this.muted = !this.muted;
        if (this.master && this.ctx) {
          this.master.gain.cancelScheduledValues(this.ctx.currentTime);
          this.master.gain.setTargetAtTime(this.muted ? 0 : 0.84, this.ctx.currentTime, 0.035);
        }
        return this.muted;
      }

      async togglePause(paused) {
        if (!this.ctx) return;
        if (paused && this.ctx.state === "running") await this.ctx.suspend();
        if (!paused && this.ctx.state === "suspended") {
          await this.ctx.resume();
          this.nextStepTime = Math.max(this.nextStepTime, this.ctx.currentTime + 0.04);
        }
      }

      position() {
        // Step-based position so variable BPM doesn't jump the playhead.
        const nominal = this.duration;
        if (!this.ctx) return (performance.now() / 1000 - this.fallbackStart) % nominal;
        return (this.stepIndex / Math.max(1, this.totalSteps)) * nominal;
      }

      visualBeat() {
        if (!this.ctx || this.ctx.state !== "running") {
          const beatPosition = this.position() / (60 / this.bpm);
          const phase = beatPosition - Math.floor(beatPosition);
          return Math.exp(-phase * 8.5);
        }
        const remaining = Math.max(0, this.nextStepTime - this.ctx.currentTime);
        const stepPhase = 1 - Math.min(1, remaining / Math.max(0.001, this.stepDuration));
        const beatPhase = ((this.stepIndex % 4) + stepPhase) / 4;
        return Math.exp(-(beatPhase % 1) * 8.5);
      }

      updateEnergy() {
        // Blend analyser with arena heat so HUD/FX also track combat pressure.
        const heatGlow = this.heat * 0.55 + this.visualBeat() * 0.2;
        if (!this.analyser || this.muted) {
          this.energy = lerp(this.energy, heatGlow, 0.12);
          return;
        }
        this.analyser.getByteFrequencyData(this.freq);
        let sum = 0;
        for (let i = 1; i < 26; i++) sum += this.freq[i];
        const value = sum / 25 / 255;
        this.energy = lerp(this.energy, value * 0.55 + heatGlow * 0.55, 0.16);
      }
    }

