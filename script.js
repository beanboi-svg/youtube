const player = document.getElementById('player');
const video = document.getElementById('video');
const playPauseBtn = document.getElementById('playPauseBtn');
const muteBtn = document.getElementById('muteBtn');
const captionsBtn = document.getElementById('captionsBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const progressContainer = document.getElementById('progressContainer');
const progressBar = document.getElementById('progressBar');
const scrubber = document.getElementById('scrubber');
const progressPreview = document.getElementById('progressPreview');
const progressPreviewFrame = document.getElementById('progressPreviewFrame');
const progressPreviewTime = document.getElementById('progressPreviewTime');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const volumeOnIcon = document.getElementById('volumeOnIcon');
const volumeOffIcon = document.getElementById('volumeOffIcon');
const fullscreenIcon = document.getElementById('fullscreenIcon');
const minimizeIcon = document.getElementById('minimizeIcon');
const uploadVideoBtn = document.getElementById('uploadVideoBtn');
const videoUploadInput = document.getElementById('videoUploadInput');
const uploadCaptionsBtn = document.getElementById('uploadCaptionsBtn');
const captionsUploadInput = document.getElementById('captionsUploadInput');
const videoContextMenu = document.getElementById('videoContextMenu');
const loopMenuItem = document.getElementById('loopMenuItem');
const loopMenuState = document.getElementById('loopMenuState');
const copyUrlMenuItem = document.getElementById('copyUrlMenuItem');

let isScrubbing = false;
let uploadedVideoUrl = null;
let progressAnimationFrame = null;
let previewSeekAnimationFrame = null;
let pendingPreviewTime = null;
let previewVideoReady = false;
let uploadedCaptionUrl = null;
let uploadedCaptionTrackElement = null;

const previewVideo = document.createElement('video');
previewVideo.muted = true;
previewVideo.preload = 'auto';
previewVideo.playsInline = true;

const previewContext = progressPreviewFrame.getContext('2d');

function formatTime(seconds) {
    if (!Number.isFinite(seconds)) {
        return '0:00';
    }

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60)
        .toString()
        .padStart(2, '0');
    return `${mins}:${secs}`;
}

function updatePlayPauseIcon() {
    const paused = video.paused;
    playIcon.style.display = paused ? '' : 'none';
    pauseIcon.style.display = paused ? 'none' : '';
}

function updateVolumeIcon() {
    const muted = video.muted || video.volume === 0;
    volumeOnIcon.style.display = muted ? 'none' : '';
    volumeOffIcon.style.display = muted ? '' : 'none';
}

function updateFullscreenIcon() {
    const isFullscreen = !!document.fullscreenElement;
    fullscreenIcon.style.display = isFullscreen ? 'none' : '';
    minimizeIcon.style.display = isFullscreen ? '' : 'none';
}

function updateProgressUI() {
    const duration = video.duration || 0;
    const current = video.currentTime || 0;
    const percent = duration ? (current / duration) * 100 : 0;

    progressBar.style.width = `${percent}%`;
    scrubber.style.left = `${percent}%`;
    progressContainer.setAttribute('aria-valuenow', String(Math.round(percent)));

    currentTimeEl.textContent = formatTime(current);
    durationEl.textContent = formatTime(duration);
}

function stopProgressAnimation() {
    if (progressAnimationFrame !== null) {
        cancelAnimationFrame(progressAnimationFrame);
        progressAnimationFrame = null;
    }
}

function animateProgress() {
    updateProgressUI();

    if (!video.paused && !video.ended) {
        progressAnimationFrame = requestAnimationFrame(animateProgress);
    } else {
        stopProgressAnimation();
    }
}

function startProgressAnimation() {
    stopProgressAnimation();
    progressAnimationFrame = requestAnimationFrame(animateProgress);
}

function setTimeFromClientX(clientX) {
    const rect = progressContainer.getBoundingClientRect();
    const clamped = Math.max(rect.left, Math.min(clientX, rect.right));
    const ratio = rect.width ? (clamped - rect.left) / rect.width : 0;
    video.currentTime = ratio * (video.duration || 0);
}

function getHoverPositionData(clientX) {
    const rect = progressContainer.getBoundingClientRect();
    const clamped = Math.max(rect.left, Math.min(clientX, rect.right));
    const ratio = rect.width ? (clamped - rect.left) / rect.width : 0;

    return {
        ratio,
        percent: ratio * 100,
        seconds: ratio * (video.duration || 0),
    };
}

function showProgressPreview(clientX) {
    const hover = getHoverPositionData(clientX);
    const rect = progressContainer.getBoundingClientRect();
    const previewWidth = progressPreview.offsetWidth || 0;
    const halfPreviewWidth = previewWidth / 2;
    const hoverX = hover.ratio * rect.width;
    const clampedX = Math.max(halfPreviewWidth, Math.min(hoverX, rect.width - halfPreviewWidth));

    progressPreview.style.left = `${clampedX}px`;
    progressPreviewTime.textContent = formatTime(hover.seconds);
    queuePreviewFrame(hover.seconds);
    progressPreview.classList.add('is-visible');
}

function hideProgressPreview() {
    progressPreview.classList.remove('is-visible');
}

function updateLoopMenuState() {
    loopMenuState.textContent = video.loop ? 'On' : 'Off';
}

function getCaptionTracks() {
    return Array.from(video.textTracks || []).filter((track) => track.kind === 'captions' || track.kind === 'subtitles');
}

function captionsAreEnabled() {
    return getCaptionTracks().some((track) => track.mode === 'showing');
}

function setCaptionsEnabled(enabled) {
    const mode = enabled ? 'showing' : 'disabled';
    getCaptionTracks().forEach((track) => {
        track.mode = mode;
    });
}

function updateCaptionsButton() {
    const hasCaptions = getCaptionTracks().length > 0;
    const enabled = hasCaptions && captionsAreEnabled();

    captionsBtn.disabled = !hasCaptions;
    captionsBtn.classList.toggle('is-active', enabled);
    captionsBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
}

function removeUploadedCaptionTrack() {
    if (uploadedCaptionTrackElement) {
        uploadedCaptionTrackElement.remove();
        uploadedCaptionTrackElement = null;
    }

    if (uploadedCaptionUrl) {
        URL.revokeObjectURL(uploadedCaptionUrl);
        uploadedCaptionUrl = null;
    }
}

function applyUploadedCaptionFile(file) {
    const isVtt = /\.vtt$/i.test(file.name) || file.type === 'text/vtt';
    if (!isVtt) {
        return;
    }

    removeUploadedCaptionTrack();

    uploadedCaptionUrl = URL.createObjectURL(file);

    const trackElement = document.createElement('track');
    trackElement.kind = 'subtitles';
    trackElement.label = file.name.replace(/\.[^.]+$/, '') || 'Uploaded captions';
    trackElement.srclang = 'en';
    trackElement.src = uploadedCaptionUrl;
    trackElement.default = true;

    trackElement.addEventListener('load', () => {
        setCaptionsEnabled(false);

        if (trackElement.track) {
            trackElement.track.mode = 'showing';
        }

        updateCaptionsButton();
    });

    uploadedCaptionTrackElement = trackElement;
    video.appendChild(trackElement);
    updateCaptionsButton();
}

function closeVideoContextMenu() {
    videoContextMenu.classList.remove('is-open');
    videoContextMenu.setAttribute('aria-hidden', 'true');
}

function openVideoContextMenu(clientX, clientY) {
    const playerRect = player.getBoundingClientRect();
    const edgePadding = 8;

    videoContextMenu.classList.add('is-open');
    videoContextMenu.setAttribute('aria-hidden', 'false');

    const menuWidth = videoContextMenu.offsetWidth;
    const menuHeight = videoContextMenu.offsetHeight;

    const rawX = clientX - playerRect.left;
    const rawY = clientY - playerRect.top;

    const left = Math.max(edgePadding, Math.min(rawX, playerRect.width - menuWidth - edgePadding));
    const top = Math.max(edgePadding, Math.min(rawY, playerRect.height - menuHeight - edgePadding));

    videoContextMenu.style.left = `${left}px`;
    videoContextMenu.style.top = `${top}px`;
}

function drawPreviewFrame() {
    if (!previewContext || previewVideo.readyState < 2) {
        return;
    }

    previewContext.drawImage(previewVideo, 0, 0, progressPreviewFrame.width, progressPreviewFrame.height);
}

function seekPreviewVideo(timeInSeconds) {
    if (!previewVideoReady || !Number.isFinite(timeInSeconds)) {
        return;
    }

    const duration = previewVideo.duration || 0;
    const clampedTime = Math.max(0, Math.min(timeInSeconds, duration));

    if (Math.abs(previewVideo.currentTime - clampedTime) < 0.04) {
        drawPreviewFrame();
        return;
    }

    previewVideo.currentTime = clampedTime;
}

function queuePreviewFrame(timeInSeconds) {
    pendingPreviewTime = timeInSeconds;

    if (previewSeekAnimationFrame !== null) {
        return;
    }

    previewSeekAnimationFrame = requestAnimationFrame(() => {
        previewSeekAnimationFrame = null;

        if (pendingPreviewTime === null) {
            return;
        }

        const targetTime = pendingPreviewTime;
        pendingPreviewTime = null;
        seekPreviewVideo(targetTime);
    });
}

function syncPreviewVideoSource() {
    previewVideoReady = false;
    previewVideo.src = video.currentSrc || video.src;
    previewVideo.load();
}

playPauseBtn.addEventListener('click', () => {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
});

video.addEventListener('click', () => {
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
});

video.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    updateLoopMenuState();
    openVideoContextMenu(event.clientX, event.clientY);
});

muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
});

captionsBtn.addEventListener('click', () => {
    const hasCaptions = getCaptionTracks().length > 0;
    if (!hasCaptions) {
        return;
    }

    setCaptionsEnabled(!captionsAreEnabled());
    updateCaptionsButton();
});

fullscreenBtn.addEventListener('click', async () => {
    if (!document.fullscreenElement) {
        await player.requestFullscreen();
    } else {
        await document.exitFullscreen();
    }
});

progressContainer.addEventListener('pointerdown', (event) => {
    isScrubbing = true;
    setTimeFromClientX(event.clientX);
    showProgressPreview(event.clientX);
});

progressContainer.addEventListener('pointermove', (event) => {
    showProgressPreview(event.clientX);
});

progressContainer.addEventListener('pointerenter', (event) => {
    showProgressPreview(event.clientX);
});

progressContainer.addEventListener('pointerleave', () => {
    if (!isScrubbing) {
        hideProgressPreview();
    }
});

window.addEventListener('pointermove', (event) => {
    if (!isScrubbing) {
        return;
    }

    setTimeFromClientX(event.clientX);
    showProgressPreview(event.clientX);
});

window.addEventListener('pointerup', () => {
    hideProgressPreview();
    isScrubbing = false;
});

document.addEventListener('click', (event) => {
    if (!videoContextMenu.classList.contains('is-open')) {
        return;
    }

    if (!videoContextMenu.contains(event.target)) {
        closeVideoContextMenu();
    }
});

window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
        closeVideoContextMenu();
    }
});

window.addEventListener('resize', closeVideoContextMenu);

progressContainer.addEventListener('keydown', (event) => {
    const duration = video.duration || 0;
    if (!duration) {
        return;
    }

    const step = Math.max(duration / 100, 1);

    if (event.key === 'ArrowRight') {
        video.currentTime = Math.min(video.currentTime + step, duration);
        event.preventDefault();
    }

    if (event.key === 'ArrowLeft') {
        video.currentTime = Math.max(video.currentTime - step, 0);
        event.preventDefault();
    }
});

video.addEventListener('loadedmetadata', updateProgressUI);
video.addEventListener('loadedmetadata', syncPreviewVideoSource);
video.addEventListener('loadedmetadata', updateCaptionsButton);
video.addEventListener('timeupdate', updateProgressUI);
video.addEventListener('play', () => {
    updatePlayPauseIcon();
    startProgressAnimation();
});
video.addEventListener('pause', () => {
    updatePlayPauseIcon();
    stopProgressAnimation();
    updateProgressUI();
});
video.addEventListener('seeking', updateProgressUI);
video.addEventListener('seeked', updateProgressUI);
video.addEventListener('ended', () => {
    stopProgressAnimation();
    updatePlayPauseIcon();
    updateProgressUI();
});
video.addEventListener('volumechange', updateVolumeIcon);
document.addEventListener('fullscreenchange', updateFullscreenIcon);

if (video.textTracks && typeof video.textTracks.addEventListener === 'function') {
    video.textTracks.addEventListener('addtrack', updateCaptionsButton);
    video.textTracks.addEventListener('removetrack', updateCaptionsButton);
}

uploadVideoBtn.addEventListener('click', () => {
    videoUploadInput.click();
});

uploadCaptionsBtn.addEventListener('click', () => {
    captionsUploadInput.click();
});

videoUploadInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        return;
    }

    if (uploadedVideoUrl) {
        URL.revokeObjectURL(uploadedVideoUrl);
    }

    uploadedVideoUrl = URL.createObjectURL(file);
    video.pause();
    video.src = uploadedVideoUrl;
    video.load();
    video.currentTime = 0;
    updatePlayPauseIcon();
    updateProgressUI();
});

captionsUploadInput.addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
        return;
    }

    applyUploadedCaptionFile(file);
    captionsUploadInput.value = '';
});

loopMenuItem.addEventListener('click', () => {
    video.loop = !video.loop;
    updateLoopMenuState();
    closeVideoContextMenu();
});

copyUrlMenuItem.addEventListener('click', async () => {
    const sourceUrl = video.currentSrc || video.src;
    const copyValue = sourceUrl.startsWith('blob:') ? window.location.href : sourceUrl;

    try {
        await navigator.clipboard.writeText(copyValue);
    } catch {
        const fallbackInput = document.createElement('textarea');
        fallbackInput.value = copyValue;
        fallbackInput.setAttribute('readonly', '');
        fallbackInput.style.position = 'absolute';
        fallbackInput.style.left = '-9999px';
        document.body.appendChild(fallbackInput);
        fallbackInput.select();
        document.execCommand('copy');
        document.body.removeChild(fallbackInput);
    }

    closeVideoContextMenu();
});

previewVideo.addEventListener('loadedmetadata', () => {
    previewVideoReady = true;
});
previewVideo.addEventListener('loadeddata', drawPreviewFrame);
previewVideo.addEventListener('seeked', drawPreviewFrame);

updatePlayPauseIcon();
updateVolumeIcon();
updateFullscreenIcon();
updateProgressUI();
updateCaptionsButton();
updateLoopMenuState();
syncPreviewVideoSource();
