// ==UserScript==
// @name         Gemini Mic
// @namespace    http://tampermonkey.net/
// @version      2025-06-21
// @description  suspend mic when gemini is playing audio
// @author       You
// @match        https://aistudio.google.com/app/live
// @icon         https://www.google.com/s2/favicons?sz=64&domain=google.com
// @grant        none
// ==/UserScript==

// ==UserScript==
// @name         Auto Mic-Off on Audio Playback
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Turns off mic when audio is playing in the browser
// @author       OpenAI
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    let mic_is_stopped = false;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    let micStreamActive = false;  // Track mic state

    function detectAudioActivity(callback) {
        function check() {
            analyser.getByteFrequencyData(dataArray);
            let hasAudio = dataArray.some(v => v > 10); // arbitrary threshold
            callback(hasAudio);
            requestAnimationFrame(check);
        }
        check();
    }

    // Patch all audio elements to connect to analyser
    function hookAllAudioElements() {
        const audios = document.querySelectorAll('audio, video');
        audios.forEach(audio => {
            try {
                if (!audio._hooked) {
                    const src = audioCtx.createMediaElementSource(audio);
                    src.connect(analyser);
                    analyser.connect(audioCtx.destination);
                    audio._hooked = true;
                }
            } catch (e) {
                // Audio element might already be connected
            }
        });
    }

    // Stop all active microphone tracks
    function stopMicrophoneTracks() {
        navigator.mediaDevices.enumerateDevices().then(devices => {
            if (devices.some(device => device.kind === 'audioinput')) {
                // Try to stop active mic streams
                if (window._activeMicStreams) {
                    window._activeMicStreams.forEach(stream => {
                        stream.getAudioTracks().forEach(track => {
                            console.log('[Mic] Stopping active track:', track);
                            track.stop();
                        });
                    });
                    window._activeMicStreams = [];
                    micStreamActive = false;
                }
            }
        });
    }

    // Resume microphone after audio stops
    function resumeMicrophone() {
        if (!micStreamActive) {
            console.log('[Mic] Resuming mic...');
            navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    window._activeMicStreams = window._activeMicStreams || [];
                    window._activeMicStreams.push(stream);
                    micStreamActive = true;
                })
                .catch(err => {
                    console.log('[Mic] Error resuming mic:', err);
                });
        }
    }

    // Hook getUserMedia to track mic streams
    const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (constraints) {
        return origGetUserMedia(constraints).then(stream => {
            if (constraints.audio) {
                window._activeMicStreams = window._activeMicStreams || [];
                window._activeMicStreams.push(stream);
                micStreamActive = true;
            }
            return stream;
        });
    };

    // Main loop to check audio playback and mic control
    setInterval(hookAllAudioElements, 2000); // periodically hook new audio/video
    detectAudioActivity(isPlaying => {
        if (isPlaying) {
            console.log('[Audio] Detected playback. Disabling mic...');
            stopMicrophoneTracks();
        } else {
            console.log('[Audio] Audio stopped. Resuming mic...');
            resumeMicrophone();
        }
    });
})();
