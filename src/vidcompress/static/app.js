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
    videoCodec: "avc1.640032",
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

  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.src = url;
    await new Promise((res, rej) => {
      v.onloadedmetadata = res;
      v.onerror = () => rej(new Error("Cannot read video metadata"));
    });

    videoMeta = {
      width: v.videoWidth,
      height: v.videoHeight,
      duration: v.duration,
    };

    $("#file-info").innerHTML = `
      <div class="file-info-grid">
        <span class="info-label">File</span>
        <span class="info-value">${file.name}</span>
        <span class="info-label">Size</span>
        <span class="info-value">${formatBytes(file.size)}</span>
        <span class="info-label">Resolution</span>
        <span class="info-value">${videoMeta.width}&times;${videoMeta.height}</span>
        <span class="info-label">Duration</span>
        <span class="info-value">${formatDuration(videoMeta.duration)}</span>
      </div>`;

    $("#file-info").style.display = "block";
    $("#settings-panel").style.display = "block";
    $("#compress-btn").disabled = false;
    $("#result-panel").style.display = "none";
    $("#progress-panel").style.display = "none";
  } finally {
    URL.revokeObjectURL(url);
  }
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

  // Auto-select first supported codec
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

  // Output dimensions
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

  // Bitrate from quality slider (exponential scale)
  const pixels = outW * outH;
  const pixelFactor = pixels / (1920 * 1080);
  const bitrate = Math.round(
    200_000 * Math.pow(25_000_000 / 200_000, quality / 100) * pixelFactor
  );

  // UI setup
  $("#compress-btn").disabled = true;
  $("#compress-btn").textContent = "Compressing\u2026";
  $("#progress-panel").style.display = "block";
  $("#result-panel").style.display = "none";
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

/* ── Show result ──────────────────────────────────────── */

function presentResult(buffer, codec, elapsed) {
  const outSize = buffer.byteLength;
  const inSize = selectedFile.size;
  const ratio = ((1 - outSize / inSize) * 100).toFixed(1);
  const speed = (videoMeta.duration / elapsed).toFixed(1);

  const blob = new Blob([buffer], { type: codec.mime });
  const url = URL.createObjectURL(blob);
  const baseName = selectedFile.name.replace(/\.[^.]+$/, "");
  const outName = `${baseName}_compressed${codec.ext}`;

  $("#result-panel").style.display = "block";
  $("#result-panel").innerHTML = `
    <div class="result-stats">
      <div class="stat">
        <span class="stat-label">Output size</span>
        <span class="stat-value">${formatBytes(outSize)}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Reduction</span>
        <span class="stat-value ${ratio > 0 ? "positive" : "negative"}">${ratio > 0 ? "\u2212" : "+"}${Math.abs(ratio)}%</span>
      </div>
      <div class="stat">
        <span class="stat-label">Speed</span>
        <span class="stat-value">${speed}x realtime</span>
      </div>
      <div class="stat">
        <span class="stat-label">Time</span>
        <span class="stat-value">${elapsed.toFixed(1)}s</span>
      </div>
    </div>
    <a href="${url}" download="${outName}" class="download-btn">
      Download ${outName}
    </a>`;
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

  const { videoTrack, audioTrack } = await new Promise((resolve, reject) => {
    mp4boxFile.onReady = (info) => {
      resolve({
        videoTrack: info.videoTracks[0],
        audioTrack: info.audioTracks[0],
      });
    };
    mp4boxFile.onError = reject;

    // Feed file in 4 MB chunks (async so the UI stays responsive)
    (async () => {
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
        console.error("Decode→Encode error:", e);
      }
    },
    error: (e) => console.error("VideoDecoder:", e),
  });

  const videoDesc = getVideoDescription(mp4boxFile, videoTrack);
  videoDecoder.configure({
    codec: videoTrack.codec,
    codedWidth: videoTrack.video.width,
    codedHeight: videoTrack.video.height,
    ...(videoDesc ? { description: videoDesc } : {}),
  });

  /* ── 7. Feed video samples ─────────────────────────── */
  for (let i = 0; i < videoSamples.length; i++) {
    const s = videoSamples[i];

    // Backpressure — pause if decoder queue is large
    while (videoDecoder.decodeQueueSize > 30) {
      await new Promise((r) => setTimeout(r, 1));
    }

    videoDecoder.decode(
      new EncodedVideoChunk({
        type: s.is_sync ? "key" : "delta",
        timestamp: (s.cts * 1_000_000) / videoTrack.timescale,
        duration: (s.duration * 1_000_000) / videoTrack.timescale,
        data: s.data,
      })
    );

    videoSamples[i] = null; // Allow GC
  }

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

  await videoDecoder.flush();
  await videoEncoder.flush();

  if (audioDecoder) {
    try {
      await audioDecoder.flush();
    } catch (e) {
      console.warn("Audio decoder flush:", e);
    }
  }
  if (audioEncoder) {
    try {
      await audioEncoder.flush();
    } catch (e) {
      console.warn("Audio encoder flush:", e);
    }
  }

  /* ── 10. Finalise ──────────────────────────────────── */
  videoDecoder.close();
  videoEncoder.close();
  if (audioDecoder) audioDecoder.close();
  if (audioEncoder) audioEncoder.close();

  muxer.finalize();
  showProgress(1, "Complete!");

  return muxer.target.buffer;
}

/* ═══════════════════════════════════════════════════════
 *  mp4box.js description extractors
 * ═══════════════════════════════════════════════════════ */

/**
 * Extract codec-specific description (SPS/PPS for AVC, VPS/SPS/PPS for HEVC, etc.)
 * Required by VideoDecoder.configure().
 */
function getVideoDescription(mp4boxFile, track) {
  try {
    const trak = mp4boxFile.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
      if (box) {
        const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
        box.write(stream);
        // Skip the 8-byte box header (size + fourcc)
        return new Uint8Array(stream.buffer, 8);
      }
    }
  } catch (e) {
    console.warn("getVideoDescription:", e);
  }
  return undefined;
}

/**
 * Extract AudioSpecificConfig from the esds box (for AAC),
 * or dOps for Opus-in-MP4.
 */
function getAudioDescription(mp4boxFile, track) {
  try {
    const trak = mp4boxFile.getTrackById(track.id);
    for (const entry of trak.mdia.minf.stbl.stsd.entries) {
      // AAC — AudioSpecificConfig lives inside the esds descriptor chain
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
      // Opus in MP4
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
