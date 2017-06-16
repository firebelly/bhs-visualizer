//------------------------------------------------------
// GLOBALS
//------------------------------------------------------

// Settings
var fftSmoothing = 0.9;
var ampSmoothing = 0.8;
var outputFramerate = 24;  // Perbrequest -- could do 60 no prob
var enterThreshold = 0.6;
var freq1Bin = 34;
var freq2Bin = 27;
var freq3Bin = 24;
var freq4Bin = 20;
var spectrogramEnabled = true;
var animWidth = 1920;
var animHeight = 1080;

// Colors
var blueFill = 'rgb(3,64,219)';
var redFill = 'rgb(255,75,75)';
var yellowFill = 'rgb(250,220,20)';

// Use for Animation
var semiCircle1ShortHistory, semiCircle2ShortHistory, semiCircle3ShortHistory, semiCircle4ShortHistory;
var freq1In, freq2In, freq3In, freq4In;
var frame;

// Use for Drawing
var fgCircleColor, bg1CircleColor, bg2CircleColor, bg3CircleColor, bg4CircleColor, bgColor;
function resetColors() {
  fgCircleColor = blueFill;
  bg1CircleColor = redFill;
  bg2CircleColor = yellowFill;
  bg3CircleColor = blueFill;
  bg4CircleColor = blueFill;
  bgColor = blueFill;
}
resetColors();


// Recording History
var recordingHistory = [];

// Use for FPS throttling
var fpsInterval = 1000 / outputFramerate;
var then, now;

// Capturing Mechanics
var songDuration, outputDuration;
var capturer;
var isRecording = false;

// Audio
var song, fft, amp;

// Canvas
var canvas, context;

    
// Load up audio (preload is a p5 convenience function)
function preload() {
  
  // Default Song
  song = loadSound('/audio/hello.mp3');
}

//------------------------------------------------------
// DRAWING HELPERS
//------------------------------------------------------

// Map output of P5's fft to [0,1]
function spectMap(x) {
  var x = x/255; 
  return x;
}

// Map output of level to a [0,1] with a more visually pleasing distribution of values
function levelMap(x) {
  var x = x/255; // map linearly to [0,1]
  
  // Apply custom curve map from: https://www.desmos.com/calculator/tarulxrflb
  // Parameters
  var a = 1.19931;
  var b = 375.807;
  var t = -39.6315;
  var e = Math.E;
  
  // Function
  return a/(1+(b*Math.pow(e,t*x)));
}

// If old differs from new by more than speedLimit, only increment an old in the direction of new by speedLimit
function speedLimit(oldVal,newVal,speedLimit) {
  if(typeof oldVal === 'undefined') { return newVal; }
  var diff = newVal - oldVal;
  if (Math.abs(diff) <= speedLimit) { return newVal; }
  var sign = Math.abs(diff)/diff;
  return sign*speedLimit + oldVal;
}

// Draw a pacman to the canvas
function drawPacman(destinationContext, x, y, radius, startAngle, endAngle, fillStyle) {
  destinationContext.fillStyle = fillStyle;
  destinationContext.beginPath();
  destinationContext.arc(x, y, radius, startAngle, endAngle);
  destinationContext.lineTo(x,y);
  destinationContext.closePath();
  destinationContext.fill();
}

// Draw a filled circle to the canvas
function drawCircle(destinationContext, x, y, radius, fillStyle) {
  destinationContext.fillStyle = fillStyle;
  destinationContext.beginPath();
  destinationContext.arc(x, y, radius, 0, TWO_PI);
  destinationContext.closePath();
  destinationContext.fill();
}

// Return a ranndom Color
function randomColor() {
  var rand = Math.floor(Math.random()*3);
  return [blueFill,redFill,yellowFill][rand]
}

//------------------------------------------------------
// CUSTOMIZATIONS
//------------------------------------------------------

// Randomize Colors
function randomizeColors() {
  fgCircleColor = randomColor();
  bg2CircleColor = randomColor();
  bg3CircleColor = randomColor();
  bg4CircleColor = randomColor();
  bgColor = randomColor();  
  
  // Because it does not have mixed blending, bg1Circle must not be same color as background.  Everything else has mixed blending--this is the only one we gotta be strict about.
  do {
    bg1CircleColor = randomColor();
  }
  while (bg1CircleColor===bgColor)
}

//------------------------------------------------------
// DRAWING
//------------------------------------------------------

// Draw a useful helper spectrogram (will only work during preview)
function drawSpectrogram(spectrum, ampLevel) {
  if(spectrogramEnabled) {
    var barWidth = 2;
    background(20);  
    for (var i = 0; i < spectrum.length; i++) {

      // Default Fill
      fill('#222');

      // 10 and 100 tick marks
      if(!(i % 10)) { fill('#555'); }
      if(!(i % 100)) { fill('#fff'); }
      
      // Color code our choice of bins
      if(i===freq1Bin) { fill(redFill) };
      if(i===freq2Bin) { fill(blueFill) };
      if(i===freq3Bin) { fill(yellowFill) };
      if(i===freq4Bin) { fill(blueFill) };

      // Draw bars
      var x = map(i, 0, spectrum.length/barWidth, 0, width);
      var h = map(spectrum[i], 0, 255, 0, height);
      rect(x, height, barWidth, -h);
      noStroke();
    }
    
    // Pop-in Threshold
    stroke('white');
    line(0, (1-enterThreshold)*300, 2048, (1-enterThreshold)*300);
    
    // Average Level
    stroke('green');
    line(0, (1-ampLevel)*300, 2048, (1-ampLevel)*300);
  }      
}

function resetAnimationVariables() {
  // Reset
  semiCircle1ShortHistory = [];
  semiCircle2ShortHistory = []; 
  semiCircle3ShortHistory = []; 
  semiCircle4ShortHistory = [];
  freq1In = false;
  freq2In = false;
  freq3In = false;
  freq4In = false;
  frame = 0;
}

// Draw all graphics onto canvas
function renderGraphics(freq1,freq2,freq3,freq4,level,ampLevel) {
  
  // randomizeColors();
  
  // Determine whether the circle has "popped in"
  if(frame/outputFramerate < songDuration) {
    freq1In = (!freq1In && (freq1 > enterThreshold)) ? true : freq1In;
    freq2In = (!freq2In && (freq2 > enterThreshold)) ? true : freq2In;
    freq3In = (!freq3In && (freq3 > enterThreshold)) ? true : freq3In;
    freq4In = (!freq4In && (freq4 > enterThreshold)) ? true : freq4In;
  } else {
    freq1In = false;
    freq2In = false;
    freq3In = false;
    freq4In = false;
  }

  var  oldestFreq = Math.round(0.2 * outputFramerate);
  semiCircle1ShortHistory.unshift(speedLimit(semiCircle1ShortHistory[0], (freq1In ? freq1*.2 + 0.85 : 0), 0.1*60/outputFramerate ));
  semiCircle2ShortHistory.unshift(speedLimit(semiCircle2ShortHistory[0], (freq2In ? freq2*.2 + 0.85 : 0), 0.1*60/outputFramerate ));
  semiCircle3ShortHistory.unshift(speedLimit(semiCircle3ShortHistory[0], (freq3In ? freq3*.2 + 0.85 : 0), 0.1*60/outputFramerate ));
  semiCircle4ShortHistory.unshift(speedLimit(semiCircle4ShortHistory[0], (freq4In ? freq4*.2 + 0.85 : 0), 0.1*60/outputFramerate ));

  semiCircle1ShortHistory = semiCircle1ShortHistory.slice(0, oldestFreq);
  semiCircle2ShortHistory = semiCircle2ShortHistory.slice(0, oldestFreq);
  semiCircle3ShortHistory = semiCircle3ShortHistory.slice(0, oldestFreq);
  semiCircle4ShortHistory = semiCircle4ShortHistory.slice(0, oldestFreq);
  
  // Calculate bg radii
  var bg1Rad = (ampLevel*.02+1)*semiCircle1ShortHistory[oldestFreq-1]; 
  var bg2Rad = (ampLevel*.02+1)*semiCircle3ShortHistory[oldestFreq-1];
  var bg3Rad = (ampLevel*.02+1)*semiCircle2ShortHistory[oldestFreq-1];
  var bg4Rad = (ampLevel*.02+1)*semiCircle4ShortHistory[oldestFreq-1];
  
  // Calculate fg radii
  var fg1Rad = (ampLevel*1.1+1)*speedLimit(semiCircle4ShortHistory[1], (freq4In ? freq4 : 0), 0.1*60/outputFramerate );
  var fg2Rad = (ampLevel*1.1+1)*speedLimit(semiCircle3ShortHistory[1], (freq3In ? freq3 : 0), 0.1*60/outputFramerate );
  var fg3Rad = (ampLevel*1.1+1)*speedLimit(semiCircle1ShortHistory[1], (freq1In ? freq1 : 0), 0.1*60/outputFramerate );
  var fg4Rad = (ampLevel*1.1+1)*speedLimit(semiCircle2ShortHistory[1], (freq2In ? freq2 : 0), 0.1*60/outputFramerate );
  
  drawTheCircles(bg1Rad, bg2Rad, bg3Rad, bg4Rad, fg1Rad, fg2Rad, fg3Rad, fg4Rad);

}

// Actually draw the shapes
function drawTheCircles(bg1Rad, bg2Rad, bg3Rad, bg4Rad, fg1Rad, fg2Rad, fg3Rad, fg4Rad) {
    // Clear Canvas
  context.clearRect(0, 0, animWidth, animHeight);

  // Default Blending
  context.globalCompositeOperation = 'source-over';

  // Background.  There can be NO transparent pixels or the webm will be corrupt
  context.fillStyle = bgColor;
  context.fillRect(0, 0, animWidth, animHeight);

  // Center Red Circle
  drawCircle( context, animWidth/2, animHeight/2, animWidth/4*bg1Rad, bg1CircleColor ); 

  // Screen Blending
  context.globalCompositeOperation = 'screen';

  // Semi Circles
  drawPacman( context, animWidth/4, animHeight/2, animWidth/4*bg2Rad, PI, TWO_PI, bg2CircleColor ); 
  drawPacman( context, animWidth*3/4, animHeight/2, animWidth/4*bg3Rad, 0, PI, bg3CircleColor ); 
  drawPacman( context, 0, animHeight/2, animWidth/4*bg4Rad, 0, PI, bg4CircleColor ); 

  // Multiply Blending
  context.globalCompositeOperation = 'multiply';
  // Little circles
  drawCircle( context, 0, animHeight/2, animWidth/8*fg1Rad, fgCircleColor );
  drawCircle( context, animWidth/4, animHeight/2, animWidth/8*fg2Rad, fgCircleColor );
  drawCircle( context, animWidth/2, animHeight/2, animWidth/8*fg3Rad, fgCircleColor );
  drawCircle( context, animWidth*3/4, animHeight/2, animWidth/8*fg4Rad, fgCircleColor );

  // Reset Blending (jic)
  context.globalCompositeOperation = 'source-over';
}

//------------------------------------------------------
// RENDER
//------------------------------------------------------

// Initiate Preview....
function startRendering() {
  
  // Clear History
  recordingHistory = [];
  
  // Update GUI
  $('.abort-button').empty().append(isRecording ? 'Stop and Export to This Point' : 'End Preview');
  $('.controls').addClass('previewing');
  updateStatus('Starting render...');
  
  // Quiet on the set
  song.stop();
  
  // Set up the fast fourier transform object that will be used to analyze audio
  fft = new p5.FFT(fftSmoothing,1024);
  
  // Get up object to get amplitude
  amp = new p5.Amplitude(ampSmoothing);

  // Set duratios to song length and a little extra
  songDuration = song.duration();
  outputDuration = songDuration+1;
  
  // Reset global animation vars
  resetAnimationVariables();

  // What time are we starting
  then = Date.now();
  
  // Play the song
  song.play();
  
  // Start previewing frames
  renderFrame();
}

// Preview a frame...
function renderFrame() {
  // Call finish function if we're done.
  if(frame/outputFramerate > outputDuration) {
    finishRendering();
  } else { 

    requestAnimationFrame(renderFrame);
    
    // Frame rate throttle check
    now = Date.now();
    var elapsed = now - then;
    if (elapsed > fpsInterval) { 
      then = now - (elapsed % fpsInterval);
      
      // UI update
      updateStatus('Rendering frame '+(frame+1)+'/'+Math.ceil(outputDuration*outputFramerate)+' ( '+((frame+1)/outputFramerate).toFixed(2)+'s / '+(Math.ceil(outputDuration*outputFramerate)/outputFramerate).toFixed(2)+'s )...  Keep tab open and visible.');

      // Analyze audio to get measures
      var spectrum = fft.analyze();  
      var freq1 = spectMap(spectrum[freq1Bin]);
      var freq2 = spectMap(spectrum[freq2Bin]);
      var freq3 = spectMap(spectrum[freq3Bin]);
      var freq4 = spectMap(spectrum[freq4Bin]);
      var level = levelMap(math.mean(spectrum));
      var ampLevel = amp.getLevel();
      
      // Draw graphics
      renderGraphics(freq1,freq2,freq3,freq4,level,ampLevel);
      
      // Save animation parameters for export
      recordingHistory.push({freq1: freq1, freq2: freq2, freq3: freq3, freq4: freq4, level: level, ampLevel: ampLevel, });

      // Reference Spectrogram
      drawSpectrogram(spectrum, ampLevel);
    
      // Advance to the next frame
      frame++;
    }
  } 
}

function finishRendering() {
  // Update GUI
  $('.controls').removeClass('previewing');
  updateStatus('Done rendering.');
      
  // Stop song if it hasn't already.
  song.stop();

  // If in recording mode, start exporting frames
  if(isRecording) {
    startExporting();
  }
}

//------------------------------------------------------
// EXPORTING
//------------------------------------------------------

function startExporting() {

  // Let the program and the user know recording has started
  updateStatus('Starting export...');

  // Init Capture
  capturer = new CCapture( {
    format: 'webm',
    framerate: outputFramerate,
    verbose: false
  } );

  // Update GUI
  $('.controls').addClass('recording');

  // Fire up Capture
  capturer.start();

  // Reset global animation vars
  resetAnimationVariables();

  // Start recording frames
  exportFrame();
}

function exportFrame() {
  // Check to make sure we're not done / past the last frame...
  if(frame/outputFramerate > outputDuration) {
    finishExporting(); 
  } else { 
    
    // UI update
    updateStatus('Exporting frame '+(frame+1)+'/'+Math.ceil(outputDuration*outputFramerate)+' ( '+((frame+1)/outputFramerate).toFixed(2)+'s / '+(Math.ceil(outputDuration*outputFramerate)/outputFramerate).toFixed(2)+'s )...');

    // Recall animation state for this frame
    var freq1 = recordingHistory[frame].freq1;
    var freq2 = recordingHistory[frame].freq2;
    var freq3 = recordingHistory[frame].freq3;
    var freq4 = recordingHistory[frame].freq4;
    var level = recordingHistory[frame].level;
    var ampLevel = recordingHistory[frame].ampLevel;
    
    // Draw graphics
    renderGraphics(freq1,freq2,freq3,freq4,level,ampLevel);
    
    // Capture
    capturer.capture( canvas );

    // Advance to the next frame
    frame++;
    requestAnimationFrame(exportFrame);
  } 
}

function finishExporting() {
    
  // Stop capture
  updateStatus('Stopping...');
  capturer.stop();

  // Prompt save
  updateStatus('Saving...');
  capturer.save();

  //Viola
  isRecording = false;
  $('.controls').removeClass('recording');
  updateStatus('Done exporting.');
  
  // Add checkmark
  $('.step-3').addClass('done');
}

//------------------------------------------------------
// GUI
//------------------------------------------------------

// Update the GUI status message
function updateStatus(message) {
  $('.status').empty().append(message);
  $('.status').addClass('alert');
  setTimeout(function() {
    $('.status').removeClass('alert');
  },50);
}

function initGui () {
  // Init Controls
  $('.controls-toggle').click(function() {
    $('.controls').toggleClass('hidden');
  });
  $('.rec-button').click(function() {
    isRecording = true;
    startRendering();
  });
  $('.preview-button').click(function() {
    startRendering();
  });
  $('.abort-button').click(function() {
    // isRecording = false;
    outputDuration = (frame+1)/outputFramerate;
  });
  $('.randomize-colors-button').click(function() {
    randomizeColors();
    
    updateStatus('Colors randomized.  Now preview and export!');
    
    // Add checkmark
    $('.step-2').addClass('done');
    
    // Preview Color Scheme
    drawTheCircles(1, 1, 1, 1, 1, 1, 1, 1);
  });
  $('.reset-colors-button').click(function() {
    resetColors();
        
    // Add checkmark
    $('.step-2').addClass('done');
    
    updateStatus('Colors back to original.');
    
    // Preview Color Scheme
    drawTheCircles(1, 1, 1, 1, 1, 1, 1, 1);
  });
  
  // Song Upload
  $("#song-upload").change(function(){
    $('.load-song, #song-upload').removeClass('highlight');
    updateStatus('Getting sound file...');
    $('.controls').addClass('loading');
    soundUploadInput = document.getElementById("song-upload")
    if(soundUploadInput.files.length != 0) {
      // Thanks http://stackoverflow.com/questions/21659810/load-image-from-local-path-and-draw-it-on-canvas
      var URL = window.webkitURL || window.URL;
      var songSrc = URL.createObjectURL(soundUploadInput.files[0]);
      var $this = $(this);
      song = loadSound(songSrc, 
        function () { 
          updateStatus('Loaded custom audio file. Now pick a color scheme!'); 
          $this.addClass('highlight');
          $('.step-1').addClass('done');
          $('.controls').removeClass('loading');
        }, function () { 
          updateStatus('Error getting song.');
          $('.controls').removeClass('loading'); 
        });
    } else {
      updateStatus('No file provided.');
      $('.controls').removeClass('loading');
    }
  });
  
  // Preset Song Buttons {
  $(".load-song").click(function() {
    $('.load-song, #song-upload').removeClass('highlight');
    $('.controls').addClass('loading');
    var songSrc = $(this).attr("data-song")
    var name = $(this).html();
    updateStatus('Loading '+name+'...');
    var $this = $(this);
    song = loadSound(songSrc, function () { 
      updateStatus('Loaded '+name+'.  Now pick a color scheme!'); 
      $this.addClass('highlight');
      $('.step-1').addClass('done');
      $('.controls').removeClass('loading');
    }, function () { 
      updateStatus('Error getting song.'); 
      $('.controls').removeClass('loading');
    });
  });
  
  // Reference Spectrogram
  spectrogramCanvas = createCanvas(2048, 300);
  spectrogramCanvas.class('spectrogram'+( spectrogramEnabled ? '' : ' disabled' ));
  noStroke();
  $('.spectrogram').attr('style','');
}

//------------------------------------------------------
// AND GO...
//------------------------------------------------------

// Init (setup is a p5 convenience function executed when everything p5 is ready to go)
function setup() {
  
  // Dom reference and context
  canvas = $('#animation')[0]
  context = canvas.getContext('2d');
  
  initGui();
  
  // Preview Frame
  drawTheCircles(1, 1, 1, 1, 1, 1, 1, 1);
  
  setTimeout(function() {
    $('.controls').removeClass('hidden');
  }, 1000);
}