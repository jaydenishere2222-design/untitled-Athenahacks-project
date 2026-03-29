import {
    FilesetResolver,
    FaceLandmarker
  } from "@mediapipe/tasks-vision";
  
  const video = document.getElementById("webcam");
  const canvas = document.getElementById("overlay");
  const ctx = canvas.getContext("2d");
  const status = document.getElementById("status");
  
  // ---------- DRIVER STATE ----------
  let nodCount = 0;
  let nodState = "neutral";
  let smoothedPitch = 0;
  
  let yawnStartTime = null;
  let isYawning = false;
  
  let lastNodTime = 0;
  let alertPlayed = false;
  
  // ---------- TUNING ----------
  const SMOOTHING = 0.8;
  const DOWN_THRESHOLD = 0.06;
  const UP_THRESHOLD = 0.025;
  
  const JAW_OPEN_THRESHOLD = 0.55;
  const YAWN_HOLD_MS = 1200;
  
  const RECENT_NOD_WINDOW_MS = 3000;
  
  // optional sound
  const alertSound = new Audio("/alert.mp3");
  
  // ---------- HELPERS ----------
  function getBlendshapeScore(blendshapes, name) {
    if (!blendshapes || blendshapes.length === 0) return 0;
    const categories = blendshapes[0].categories || [];
    const match = categories.find((c) => c.categoryName === name);
    return match ? match.score : 0;
  }
  
  function drawPoint(pt, color = "red", radius = 4) {
    ctx.beginPath();
    ctx.arc(pt.x * canvas.width, pt.y * canvas.height, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
  
  function drawText(lines, color = "lime") {
    ctx.font = "22px sans-serif";
    ctx.fillStyle = color;
    lines.forEach((line, i) => {
      ctx.fillText(line, 20, 35 + i * 30);
    });
  }
  
  function computePitchSignal(landmarks) {
    const forehead = landmarks[10];
    const chin = landmarks[152];
    const nose = landmarks[1];
  
    const faceMidY = (forehead.y + chin.y) / 2;
    const faceHeight = Math.abs(chin.y - forehead.y);
  
    if (faceHeight < 1e-6) return 0;
  
    return (nose.y - faceMidY) / faceHeight;
  }
  
  function updateNodCounter(pitch) {
    const now = performance.now();
  
    if (nodState === "neutral" && pitch > DOWN_THRESHOLD) {
      nodState = "down";
    } else if (nodState === "down" && pitch < UP_THRESHOLD) {
      nodState = "neutral";
      nodCount += 1;
      lastNodTime = now;
    }
  }
  
  function updateYawn(jawOpen) {
    const now = performance.now();
  
    if (jawOpen > JAW_OPEN_THRESHOLD) {
      if (yawnStartTime === null) {
        yawnStartTime = now;
      }
  
      if (now - yawnStartTime >= YAWN_HOLD_MS) {
        isYawning = true;
      }
    } else {
      yawnStartTime = null;
      isYawning = false;
    }
  }
  
  function getDriverStatus() {
    const now = performance.now();
    const recentNod = now - lastNodTime < RECENT_NOD_WINDOW_MS;
  
    if (isYawning && recentNod) {
      return {
        level: "CRITICAL",
        message: "Drowsiness detected. Please pull over safely.",
        color: "red"
      };
    }
  
    if (isYawning || recentNod) {
      return {
        level: "WARNING",
        message: "Fatigue signs detected. Please stay attentive.",
        color: "orange"
      };
    }
  
    return {
      level: "SAFE",
      message: "Driver appears alert.",
      color: "lime"
    };
  }
  
  function playCriticalAlert(level) {
    if (level === "CRITICAL" && !alertPlayed) {
      alertSound.currentTime = 0;
      alertSound.play().catch(() => {});
      alertPlayed = true;
    }
  
    if (level !== "CRITICAL") {
      alertPlayed = false;
    }
  }
  
  // ---------- MAIN ----------
  async function init() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  
    await new Promise((resolve) => {
      video.onloadeddata = resolve;
    });
  
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  
    status.textContent = "Loading Driver Safety Monitor...";
  
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
  
    const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true
    });
  
    status.textContent = "Driver Safety Monitor active";
  
    let lastVideoTime = -1;
  
    function loop() {
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
  
        const result = faceLandmarker.detectForVideo(video, performance.now());
  
        ctx.clearRect(0, 0, canvas.width, canvas.height);
  
        if (result.faceLandmarks && result.faceLandmarks.length > 0) {
          const landmarks = result.faceLandmarks[0];
  
          const forehead = landmarks[10];
          const nose = landmarks[1];
          const chin = landmarks[152];
          const mouthTop = landmarks[13];
          const mouthBottom = landmarks[14];
  
          // draw guide points
          drawPoint(forehead, "cyan");
          drawPoint(nose, "yellow");
          drawPoint(chin, "magenta");
          drawPoint(mouthTop, "red");
          drawPoint(mouthBottom, "red");
  
          // head nod logic
          const rawPitch = computePitchSignal(landmarks);
          smoothedPitch =
            SMOOTHING * smoothedPitch + (1 - SMOOTHING) * rawPitch;
          updateNodCounter(smoothedPitch);
  
          // yawn logic
          const jawOpen = getBlendshapeScore(result.faceBlendshapes, "jawOpen");
          updateYawn(jawOpen);
  
          // driver alert
          const driverStatus = getDriverStatus();
          playCriticalAlert(driverStatus.level);
  
          drawText(
            [
              "Driver Safety Monitor",
              `Yawning: ${isYawning ? "YES" : "NO"}`,
              `Head nods: ${nodCount}`,
              `Pitch: ${smoothedPitch.toFixed(3)}`,
              `Alert: ${driverStatus.level}`,
              driverStatus.message
            ],
            driverStatus.color
          );
  
          status.textContent =
            `${driverStatus.level} | Yawning: ${isYawning ? "YES" : "NO"} | Nods: ${nodCount}`;
  
        } else {
          status.textContent = "No face detected";
          nodState = "neutral";
          yawnStartTime = null;
          isYawning = false;
  
          drawText(
            [
              "Driver Safety Monitor",
              "No face detected"
            ],
            "white"
          );
        }
      }
  
      requestAnimationFrame(loop);
    }
  
    loop();
  }
  
  init().catch((err) => {
    console.error(err);
    status.textContent = `Error: ${err.message}`;
  });