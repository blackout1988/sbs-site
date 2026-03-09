/* ================================
   SBS Top Slider (scoped)
   - Wrapped in an IIFE to avoid globals clashing with player.js
   ================================ */

(()=>{
  const SLIDES = [
    { src: "assets/slider/slide1.jpg", alt: "7TH BLOCK SOCIETY – BTS 1" },
    { src: "assets/slider/slide2.jpg", alt: "7TH BLOCK SOCIETY – BTS 2" },
    { src: "assets/slider/slide3.jpg", alt: "7TH BLOCK SOCIETY – BTS 2" },
  ];

  const viewport = document.getElementById("topSliderViewport");
  const track = document.getElementById("topSliderTrack");
  const dotsEl = document.getElementById("topSliderDots");
  const sliderPrevBtn = document.getElementById("topSliderPrev");
  const sliderNextBtn = document.getElementById("topSliderNext");

  let idx = 0;
  let timer = null;

  function slideHtml(s){
    return `
      <div class="topSlider__slide">
        <img class="topSlider__img" src="${s.src}" alt="${s.alt || ""}" loading="lazy">
        <div class="topSlider__shade"></div>
      </div>
    `;
  }

  function render(){
    if (!track) return;

    if (!SLIDES.length){
      viewport?.closest(".topSlider")?.remove();
      return;
    }

    track.innerHTML = SLIDES.map(slideHtml).join("");

    // If images 404, keep slider height and show subtle background
    [...track.querySelectorAll("img")].forEach((img)=>{
      img.addEventListener("error", ()=>{
        img.style.opacity = "0";
        img.style.background = "linear-gradient(135deg, rgba(254,0,0,0.15), rgba(15,35,46,0.25))";
      });
    });

    if (dotsEl){
      dotsEl.innerHTML = SLIDES.map((_, i)=>`
        <button class="topSlider__dot ${i===0 ? "is-active" : ""}" type="button" aria-label="Go to slide ${i+1}" data-i="${i}"></button>
      `).join("");

      dotsEl.addEventListener("click", (e)=>{
        const b = e.target.closest(".topSlider__dot");
        if (!b) return;
        go(Number(b.dataset.i || 0));
      });
    }

    apply();
  }

  function apply(){
    if (!track) return;
    track.style.transform = `translateX(${-idx * 100}%)`;

    if (dotsEl){
      [...dotsEl.querySelectorAll(".topSlider__dot")].forEach((d,i)=>{
        d.classList.toggle("is-active", i === idx);
      });
    }
  }

  function go(n){
    if (!SLIDES.length) return;
    idx = (n + SLIDES.length) % SLIDES.length;
    apply();
    restart();
  }

  function next(){ go(idx + 1); }
  function prev(){ go(idx - 1); }

  function restart(){
    stopAuto();
    startAuto();
  }

  function startAuto(){
    if (SLIDES.length <= 1) return;
    timer = setInterval(next, 5000);
  }

  function stopAuto(){
    if (timer) clearInterval(timer);
    timer = null;
  }

  sliderPrevBtn?.addEventListener("click", prev);
  sliderNextBtn?.addEventListener("click", next);

  viewport?.addEventListener("mouseenter", stopAuto);
  viewport?.addEventListener("mouseleave", startAuto);

  render();
  startAuto();
})();
