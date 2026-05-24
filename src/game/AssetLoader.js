export class AssetLoader {
  async loadManifest(url) {
    return this.loadJson(url);
  }

  async loadJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load JSON: ${url}`);
    }
    return response.json();
  }

  async loadOptionalJson(url) {
    if (!url) return null;
    try {
      return await this.loadJson(url);
    } catch {
      return null;
    }
  }

  loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${url}`));
      image.src = url;
    });
  }

  loadOptionalAudio(url) {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.oncanplaythrough = () => resolve(audio);
      audio.onerror = () => resolve(null);
      audio.src = url;
      audio.load();
    });
  }

  loadOptionalVideo(url) {
    if (!url) return Promise.resolve(null);
    return new Promise((resolve) => {
      const video = document.createElement("video");
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve(video);
      };
      video.preload = "auto";
      video.playsInline = true;
      video.onloadedmetadata = finish;
      video.onloadeddata = finish;
      video.onerror = () => resolve(null);
      video.src = url;
      video.load();
    });
  }
}
