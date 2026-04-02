/*
 * VidCompress — Client-side video transcoding with WebCodecs
 *
 * Pipeline: MP4Box demux → VideoDecoder → VideoEncoder → mp4-muxer/webm-muxer
 * All processing happens in the browser using hardware-accelerated codecs.
 */

import {
  Muxer as Mp4Muxer,
  ArrayBufferTarget as Mp4Target,
} from "https://cdn.jsdelivr.net/npm/mp4-muxer@4/build/mp4-muxer.mjs";

import {
  Muxer as WebmMuxer,
  ArrayBufferTarget as WebmTarget,
} from "https://cdn.jsdelivr.net/npm/webm-muxer@4/build/webm-muxer.mjs";

/* ── Codec registry ───────────────────────────────────── */

const CODECS = {
  h264: {
    label: "H.264 (AVC)",
    videoCodec: "avc1.4d0034",
    container: "mp4",
    ext: ".mp4",
    muxerVideoCodec: "avc",
    audioCodec: "mp4a.40.2",
    muxerAudioCodec: "aac",
    mime: "video/mp4",
  },
  h265: {
    label: "H.265 (HEVC)",
    videoCodec: "hvc1.1.6.L120.90",
    container: "mp4",
    ext: ".mp4",
    muxerVideoCodec: "hevc",
    audioCodec: "mp4a.40.2",
    muxerAudioCodec: "aac",
    mime: "video/mp4",
  },
  vp9: {
    label: "VP9",
    videoCodec: "vp09.00.10.08",
    container: "webm",
    ext: ".webm",
    muxerVideoCodec: "V_VP9",
    audioCodec: "opus",
    muxerAudioCodec: "A_OPUS",
    mime: "video/webm",
  },
  av1: {
    label: "AV1",
    videoCodec: "av01.0.08M.08",
    container: "mp4",
    ext: ".mp4",
    muxerVideoCodec: "av1",
    audioCodec: "mp4a.40.2",
    muxerAudioCodec: "aac",
    mime: "video/mp4",
  },
};

/* ── Helpers ──────────────────────────────────────────── */

const $ = (s) => document.querySelector(s);

function formatBytes(b) {
  if (b < 1024) return b + " B";
  if (b < 1_048_576) return (b / 1024).toFixed(1) + " KB";
  if (b < 1_073_741_824) return (b / 1_048_576).toFixed(1) + " MB";
  return (b / 1_073_741_824).toFixed(2) + " GB";
}

function formatDuration(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

/* ── State ────────────────────────────────────────────── */

let selectedFile = null;
let videoMeta = null;
let isCompressing = false;
let inputVideoUrl = null;
let outputVideoUrl = null;

/* ── Initialisation ───────────────────────────────────── */

document.addEventListener("DOMContentLoaded", init);

function init() {
  if (typeof VideoEncoder === "undefined") {
    $("#app").innerHTML = `
      <div class="error-banner">
        <h2>WebCodecs Not Supported</h2>
        <p>Your browser doesn't support the WebCodecs API.</p>
        <p>Please use <strong>Chrome 94+</strong> or <strong>Edge 94+</strong>.</p>
      </div>`;
    return;
  }

  setupDragDrop();
  setupFileInput();
  setupControls();
  detectCodecSupport();
}

/* ── Drag & Drop ──────────────────────────────────────── */

function setupDragDrop() {
  const dz = $("#drop-zone");

  ["dragenter", "dragover"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.add("drag-over");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dz.addEventListener(evt, (e) => {
      e.preventDefault();
      dz.classList.remove("drag-over");
    })
  );

  dz.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith("video/")) handleFile(f);
  });
  dz.addEventListener("click", () => $("#file-input").click());
}

function setupFileInput() {
  $("#file-input").addEventListener("change", (e) => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });
}

/* ── File selection ───────────────────────────────────── */

async function handleFile(file) {
  selectedFile = file;

  // Revoke previous URLs
  if (inputVideoUrl) URL.revokeObjectURL(inputVideoUrl);
  if (outputVideoUrl) URL.revokeObjectURL(outputVideoUrl);
  outputVideoUrl = null;

  inputVideoUrl = URL.createObjectURL(file);

  const vid = $("#input-video");
  vid.src = inputVideoUrl;

  await new Promise((res, rej) => {
    vid.onloadedmetadata = res;
    vid.onerror = () => rej(new Error("Cannot read video metadata"));
  });

  videoMeta = {
    width: vid.videoWidth,
    height: vid.videoHeight,
    duration: vid.duration,
  };

  $("#file-info").innerHTML = `
    <span class="info-chip"><strong>${file.name}</strong></span>
    <span class="info-chip">${formatBytes(file.size)}</span>
    <span class="info-chip">${videoMeta.width}&times;${videoMeta.height}</span>
    <span class="info-chip">${formatDuration(videoMeta.duration)}</span>`;

  $("#input-preview").style.display = "block";
  $("#settings-panel").style.display = "block";
  $("#compress-btn").disabled = false;
  $("#result-panel").style.display = "none";
  $("#compare-panel").style.display = "none";
  $("#progress-panel").style.display = "none";
}

/* ── Controls ─────────────────────────────────────────── */

function setupControls() {
  const slider = $("#quality");
  const label = $("#quality-value");
  slider.addEventListener("input", () => (label.textContent = slider.value));
  $("#compress-btn").addEventListener("click", startCompression);
}

/* ── Codec detection ──────────────────────────────────── */

async function detectCodecSupport() {
  const select = $("#codec");

  for (const [key, cfg] of Object.entries(CODECS)) {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = cfg.label;

    try {
      const { supported } = await VideoEncoder.isConfigSupported({
        codec: cfg.videoCodec,
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
      });
      if (!supported) {
        opt.textContent += " (unsupported)";
        opt.disabled = true;
      }
    } catch {
      opt.textContent += " (unsupported)";
      opt.disabled = true;
    }

    select.appendChild(opt);
  }

  const first = select.querySelector("option:not([disabled])");
  if (first) first.selected = true;
}

/* ── Progress helpers ─────────────────────────────────── */

function showProgress(pct, detail) {
  $("#progress-bar-fill").style.width = `${Math.round(pct * 100)}%`;
  $("#progress-percent").textContent = `${Math.round(pct * 100)}%`;
  if (detail) $("#progress-text").textContent = detail;
}

/* ── Start compression ────────────────────────────────── */

async function startCompression() {
  if (isCompressing || !selectedFile) return;
  isCompressing = true;

  const codecKey = $("#codec").value;
  const codec = CODECS[codecKey];
  const quality = parseInt($("#quality").value, 10);
  const resValue = $("#resolution").value;

  let outW = videoMeta.width;
  let outH = videoMeta.height;
  if (resValue !== "original") {
    const targetH = parseInt(resValue, 10);
    if (outH > targetH) {
      outW = Math.round((outW * targetH) / outH / 2) * 2;
      outH = targetH;
    }
  }
  outW = Math.round(outW / 2) * 2;
  outH = Math.round(outH / 2) * 2;

  const pixels = outW * outH;
  const pixelFactor = pixels / (1920 * 1080);
  const bitrate = Math.round(
    200_000 * Math.pow(25_000_000 / 200_000, quality / 100) * pixelFactor
  );

  $("#compress-btn").disabled = true;
  $("#compress-btn").textContent = "Compressing\u2026";
  $("#progress-panel").style.display = "block";
  $("#result-panel").style.display = "none";
  $("#compare-panel").style.display = "none";
  $("#progress-text").style.color = "";
  showProgress(0, "Starting\u2026");

  const t0 = performance.now();

  try {
    const buf = await transcode(selectedFile, {
      codecKey,
      videoCodec: codec.videoCodec,
      audioCodec: codec.audioCodec,
      container: codec.container,
      muxerVideoCodec: codec.muxerVideoCodec,
      muxerAudioCodec: codec.muxerAudioCodec,
      bitrate,
      outW,
      outH,
    });

    const elapsed = (performance.now() - t0) / 1000;
    presentResult(buf, codec, elapsed);
  } catch (err) {
    console.error("Compression failed:", err);
    $("#progress-text").textContent = `Error: ${err.message}`;
    $("#progress-text").style.color = "var(--red)";
  } finally {
    isCompressing = false;
    $("#compress-btn").disabled = false;
    $("#compress-btn").textContent = "Compress";
  }
}

/* ── Show result + comparison ─────────────────────────── */

function presentResult(buffer, codec, elapsed) {
  const outSize = buffer.byteLength;
  const inSize = selectedFile.size;
  const ratio = ((1 - outSize / inSize) * 100).toFixed(1);
  const speed = (videoMeta.duration / elapsed).toFixed(1);

  // Create output blob URL
  if (outputVideoUrl) URL.revokeObjectURL(outputVideoUrl);
  const blob = new Blob([buffer], { type: codec.mime });
  outputVideoUrl = URL.createObjectURL(blob);

  const baseName = selectedFile.name.replace(/\.[^.]+$/, "");
  const outName = `${baseName}_compressed${codec.ext}`;

  // ── Stats + download ──
  $("#result-stats").innerHTML = `
    <div class="stat">
      <span class="stat-label">Output</span>
      <span class="stat-value">${formatBytes(outSize)}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Reduction</span>
      <span class="stat-value ${ratio > 0 ? "positive" : "negative"}">${ratio > 0 ? "\u2212" : "+"}${Math.abs(ratio)}%</span>
    </div>
    <div class="stat">
      <span class="stat-label">Speed</span>
      <span class="stat-value">${speed}x</span>
    </div>
    <div class="stat">
      <span class="stat-label">Time</span>
      <span class="stat-value">${elapsed.toFixed(1)}s</span>
    </div>`;

  const dlBtn = $("#download-btn");
  dlBtn.href = outputVideoUrl;
  dlBtn.download = outName;
  dlBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> ${outName}`;

  $("#result-panel").style.display = "block";

  // ── Comparison slider ──
  setupComparison(inputVideoUrl, outputVideoUrl);
}

/* ═══════════════════════════════════════════════════════
 *  Comparison slider
 * ═══════════════════════════════════════════════════════ */

function setupComparison(originalUrl, compressedUrl) {
  const panel = $("#compare-panel");
  const container = $("#compare-container");
  const vidOrig = $("#compare-original");
  const vidComp = $("#compare-compressed");
  const divider = $("#compare-divider");
  const playBtn = $("#compare-play-btn");
  const seekBar = $("#compare-seek");
  const playIcon = $("#play-icon");
  const pauseIcon = $("#pause-icon");

  // Load both videos
  vidOrig.src = originalUrl;
  vidComp.src = compressedUrl;

  panel.style.display = "block";

  // Wait for both to be ready
  Promise.all([
    new Promise((r) => (vidOrig.onloadeddata = r)),
    new Promise((r) => (vidComp.onloadeddata = r)),
  ]).then(() => {
    // Set initial slider position
    setSliderPosition(50);
  });

  // ── Slider drag ──
  let dragging = false;

  function setSliderPosition(pct) {
    pct = Math.max(0, Math.min(100, pct));
    vidOrig.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
    divider.style.left = `${pct}%`;
  }

  function getPercent(e) {
    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    return ((clientX - rect.left) / rect.width) * 100;
  }

  container.addEventListener("mousedown", (e) => {
    dragging = true;
    setSliderPosition(getPercent(e));
  });
  container.addEventListener("touchstart", (e) => {
    dragging = true;
    setSliderPosition(getPercent(e));
  });

  window.addEventListener("mousemove", (e) => {
    if (dragging) setSliderPosition(getPercent(e));
  });
  window.addEventListener("touchmove", (e) => {
    if (dragging) setSliderPosition(getPercent(e));
  });

  window.addEventListener("mouseup", () => (dragging = false));
  window.addEventListener("touchend", () => (dragging = false));

  // ── Play / Pause ──
  let playing = false;

  playBtn.onclick = () => {
    if (playing) {
      vidOrig.pause();
      vidComp.pause();
      playIcon.style.display = "";
      pauseIcon.style.display = "none";
    } else {
      vidOrig.play();
      vidComp.play();
      playIcon.style.display = "none";
      pauseIcon.style.display = "";
    }
    playing = !playing;
  };

  // ── Sync playback ──
  vidOrig.addEventListener("timeupdate", () => {
    if (!vidComp.paused && Math.abs(vidOrig.currentTime - vidComp.currentTime) > 0.1) {
      vidComp.currentTime = vidOrig.currentTime;
    }
    if (vidOrig.duration) {
      seekBar.value = (vidOrig.currentTime / vidOrig.duration) * 1000;
    }
  });

  vidOrig.addEventListener("ended", () => {
    playing = false;
    playIcon.style.display = "";
    pauseIcon.style.display = "none";
  });

  // ── Seek bar ──
  seekBar.addEventListener("input", () => {
    const t = (seekBar.value / 1000) * vidOrig.duration;
    vidOrig.currentTime = t;
    vidComp.currentTime = t;
  });
}

/* ═══════════════════════════════════════════════════════
 *  Transcode pipeline
 * ═══════════════════════════════════════════════════════ */

async function transcode(file, cfg) {
  const {
    videoCodec,
    audioCodec,
    container,
    muxerVideoCodec,
    muxerAudioCodec,
    bitrate,
    outW,
    outH,
  } = cfg;

  /* ── 1. Demux with mp4box.js ────────────────────────── */
  showProgress(0, "Reading file\u2026");

  const mp4boxFile = MP4Box.createFile();

  let readingDone;
  const { videoTrack, audioTrack } = await new Promise((resolve, reject) => {
    mp4boxFile.onReady = (info) => {
      resolve({
        videoTrack: info.videoTracks[0],
        audioTrack: info.audioTracks[0],
      });
    };
    mp4boxFile.onError = reject;

    readingDone = (async () => {
      const CHUNK = 4 * 1024 * 1024;
      let offset = 0;
      while (offset < file.size) {
        const slice = file.slice(offset, offset + CHUNK);
        const buf = await slice.arrayBuffer();
        buf.fileStart = offset;
        mp4boxFile.appendBuffer(buf);
        offset += CHUNK;
        showProgress(
          0.05 * (offset / file.size),
          `Reading file\u2026 ${formatBytes(offset)} / ${formatBytes(file.size)}`
        );
      }
      mp4boxFile.flush();
    })();
  });

  await readingDone;

  if (!videoTrack) throw new Error("No video track found in file");

  /* ── 2. Extract all samples ─────────────────────────── */
  showProgress(0.06, "Extracting samples\u2026");

  const videoSamples = [];
  const audioSamples = [];

  mp4boxFile.onSamples = (trackId, _ref, samples) => {
    for (const s of samples) {
      if (trackId === videoTrack.id) videoSamples.push(s);
      else if (audioTrack && trackId === audioTrack.id) audioSamples.push(s);
    }
  };

  mp4boxFile.setExtractionOptions(videoTrack.id, null, {
    nbSamples: 10_000,
  });
  if (audioTrack) {
    mp4boxFile.setExtractionOptions(audioTrack.id, null, {
      nbSamples: 10_000,
    });
  }
  mp4boxFile.start();

  showProgress(
    0.1,
    `Extracted ${videoSamples.length} video` +
      (audioSamples.length ? `, ${audioSamples.length} audio samples` : " samples")
  );

  /* ── 3. Build muxer ────────────────────────────────── */
  const fps =
    videoTrack.nb_samples / (videoTrack.duration / videoTrack.timescale) || 30;
  const hasAudio = audioTrack && audioSamples.length > 0;

  let muxer;
  if (container === "mp4") {
    const opts = {
      target: new Mp4Target(),
      video: { codec: muxerVideoCodec, width: outW, height: outH },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    };
    if (hasAudio) {
      opts.audio = {
        codec: muxerAudioCodec,
        numberOfChannels: audioTrack.audio.channel_count,
        sampleRate: audioTrack.audio.sample_rate,
      };
    }
    muxer = new Mp4Muxer(opts);
  } else {
    const opts = {
      target: new WebmTarget(),
      video: { codec: muxerVideoCodec, width: outW, height: outH },
      firstTimestampBehavior: "offset",
    };
    if (hasAudio) {
      opts.audio = {
        codec: muxerAudioCodec,
        numberOfChannels: audioTrack.audio.channel_count,
        sampleRate: audioTrack.audio.sample_rate,
      };
    }
    muxer = new WebmMuxer(opts);
  }

  /* ── 4. Video encoder ──────────────────────────────── */
  let encodedFrames = 0;
  const totalFrames = videoSamples.length;
  const encStart = performance.now();
  const keyFrameInterval = Math.max(1, Math.round(fps * 2));

  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      muxer.addVideoChunk(chunk, meta);
      encodedFrames++;
      const elapsed = (performance.now() - encStart) / 1000;
      const curFps = (encodedFrames / elapsed).toFixed(0);
      showProgress(
        0.1 + 0.85 * (encodedFrames / totalFrames),
        `Encoding frame ${encodedFrames}/${totalFrames} \u00b7 ${curFps} fps`
      );
    },
    error: (e) => console.error("VideoEncoder:", e),
  });

  videoEncoder.configure({
    codec: videoCodec,
    width: outW,
    height: outH,
    bitrate,
    bitrateMode: "variable",
    latencyMode: "quality",
    framerate: fps,
  });

  /* ── 5. Audio encoder + decoder (optional) ─────────── */
  let audioEncoder = null;
  let audioDecoder = null;

  if (hasAudio) {
    try {
      const aSupport = await AudioEncoder.isConfigSupported({
        codec: audioCodec,
        numberOfChannels: audioTrack.audio.channel_count,
        sampleRate: audioTrack.audio.sample_rate,
        bitrate: 128_000,
      });

      if (aSupport.supported) {
        audioEncoder = new AudioEncoder({
          output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
          error: (e) => console.warn("AudioEncoder:", e),
        });
        audioEncoder.configure({
          codec: audioCodec,
          numberOfChannels: audioTrack.audio.channel_count,
          sampleRate: audioTrack.audio.sample_rate,
          bitrate: 128_000,
        });

        const audioDesc = getAudioDescription(mp4boxFile, audioTrack);
        audioDecoder = new AudioDecoder({
          output: (data) => {
            audioEncoder.encode(data);
            data.close();
          },
          error: (e) => console.warn("AudioDecoder:", e),
        });
        audioDecoder.configure({
          codec: audioTrack.codec,
          sampleRate: audioTrack.audio.sample_rate,
          numberOfChannels: audioTrack.audio.channel_count,
          ...(audioDesc ? { description: audioDesc } : {}),
        });
      }
    } catch (e) {
      console.warn("Audio pipeline setup failed, continuing without audio:", e);
      audioEncoder = null;
      audioDecoder = null;
    }
  }

  /* ── 6. Video decoder ──────────────────────────────── */
  const needsResize =
    outW !== videoTrack.video.width || outH !== videoTrack.video.height;
  let frameIdx = 0;

  const videoDecoder = new VideoDecoder({
    output: (frame) => {
      try {
        const kf = frameIdx % keyFrameInterval === 0;

        if (needsResize) {
          const canvas = new OffscreenCanvas(outW, outH);
          const ctx = canvas.getContext("2d");
          ctx.drawImage(frame, 0, 0, outW, outH);
          const resized = new VideoFrame(canvas, {
            timestamp: frame.timestamp,
            duration: frame.duration,
          });
          frame.close();
          videoEncoder.encode(resized, { keyFrame: kf });
          resized.close();
        } else {
          videoEncoder.encode(frame, { keyFrame: kf });
          frame.close();
        }

        frameIdx++;
      } catch (e) {
        frame.close();
        console.error("Decode\u2192Encode error:", e);
      }
    },
    error: (e) => console.warn("VideoDecoder error (will reconfigure):", e),
  });

  const videoDesc = getVideoDescription(mp4boxFile, videoTrack);
  const decoderConfig = {
    codec: videoTrack.codec,
    codedWidth: videoTrack.video.width,
    codedHeight: videoTrack.video.height,
    ...(videoDesc ? { description: videoDesc } : {}),
  };
  videoDecoder.configure(decoderConfig);

  /* ── 7. Feed video samples ─────────────────────────── */
  let skippedFrames = 0;
  for (let i = 0; i < videoSamples.length; i++) {
    const s = videoSamples[i];

    // If decoder closed due to error, reconfigure and skip to next keyframe
    if (videoDecoder.state === "closed" || videoDecoder.state === "unconfigured") {
      console.warn(`[DEBUG] Decoder ${videoDecoder.state} at sample ${i}, scanning for next keyframe to recover…`);
      // Find the next sync (keyframe) sample to resume from
      while (i < videoSamples.length && !videoSamples[i].is_sync) {
        skippedFrames++;
        videoSamples[i] = null;
        i++;
      }
      if (i >= videoSamples.length) break;
      // Recreate and reconfigure the decoder
      videoDecoder.configure(decoderConfig);
      console.warn(`[DEBUG] Decoder reconfigured, resuming at keyframe sample ${i}, skipped ${skippedFrames} frames`);
    }

    while (videoDecoder.decodeQueueSize > 30) {
      await new Promise((r) => setTimeout(r, 1));
    }

    try {
      videoDecoder.decode(
        new EncodedVideoChunk({
          type: s.is_sync ? "key" : "delta",
          timestamp: (s.cts * 1_000_000) / videoTrack.timescale,
          duration: (s.duration * 1_000_000) / videoTrack.timescale,
          data: s.data,
        })
      );
    } catch (e) {
      console.warn(`[DEBUG] decode() threw at sample ${i}:`, e);
      skippedFrames++;
    }

    videoSamples[i] = null;
  }
  if (skippedFrames > 0) console.warn(`[DEBUG] Total skipped video frames: ${skippedFrames}`);

  /* ── 8. Feed audio samples ─────────────────────────── */
  if (audioDecoder) {
    for (let i = 0; i < audioSamples.length; i++) {
      const s = audioSamples[i];

      while (audioDecoder.decodeQueueSize > 30) {
        await new Promise((r) => setTimeout(r, 1));
      }

      try {
        audioDecoder.decode(
          new EncodedAudioChunk({
            type: s.is_sync ? "key" : "delta",
            timestamp: (s.cts * 1_000_000) / audioTrack.timescale,
            duration: (s.duration * 1_000_000) / audioTrack.timescale,
            data: s.data,
          })
        );
      } catch (e) {
        console.warn("Audio sample decode error:", e);
      }

      audioSamples[i] = null;
    }
  }

  /* ── 9. Flush everything ───────────────────────────── */
  showProgress(0.96, "Flushing encoders\u2026");

  const safeFlush = async (codec, label) => {
    try {
      if (codec.state === "configured") await codec.flush();
    } catch (e) {
      console.warn(`${label} flush:`, e);
    }
  };

  const safeClose = (codec, label) => {
    try {
      if (codec.state !== "closed") codec.close();
    } catch (e) {
      console.warn(`${label} close:`, e);
    }
  };

  await safeFlush(videoDecoder, "VideoDecoder");
  await safeFlush(videoEncoder, "VideoEncoder");
  if (audioDecoder) await safeFlush(audioDecoder, "AudioDecoder");
  if (audioEncoder) await safeFlush(audioEncoder, "AudioEncoder");

  /* ── 10. Finalise ──────────────────────────────────── */
  safeClose(videoDecoder, "VideoDecoder");
  safeClose(videoEncoder, "VideoEncoder");
  if (audioDecoder) safeClose(audioDecoder, "AudioDecoder");
  if (audioEncoder) safeClose(audioEncoder, "AudioEncoder");

  muxer.finalize();
  showProgress(1, "Complete!");

  return muxer.target.buffer;
}

/* ═══════════════════════════════════════════════════════
 *  mp4box.js description extractors
 * ═══════════════════════════════════════════════════════ */

function getVideoDescription(mp4boxFile, track) {
  try {
    const trak = mp4boxFile.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        return new Uint8Array(stream.buffer, 8);
      }
    }
  } catch (e) {
    console.warn("getVideoDescription:", e);
  }
  return undefined;
}

function getAudioDescription(mp4boxFile, track) {
  try {
    const trak = mp4boxFile.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      if (entry.esds) {
        const { esd } = entry.esds;
        if (esd && esd.descs) {
          for (const desc of esd.descs) {
            if (desc.descs) {
              for (const sub of desc.descs) {
                if (sub.data) return sub.data;
              }
            }
          }
        }
      }
      if (entry.dOps) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        entry.dOps.write(stream);
        return new Uint8Array(stream.buffer, 8);
      }
    }
  } catch (e) {
    console.warn("getAudioDescription:", e);
  }
  return undefined;
}
