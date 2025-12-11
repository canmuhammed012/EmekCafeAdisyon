// Ses çıkarma utility fonksiyonu

export const playActionSound = () => {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    // Kısa ve yumuşak bir bip sesi
    oscillator.frequency.value = 800; // 800 Hz
    oscillator.type = 'sine';
    
    // Ses seviyesi (0-1 arası)
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
  } catch (error) {
    // Eğer AudioContext desteklenmiyorsa sessizce devam et
    console.warn('Ses çalınamadı:', error);
  }
};

