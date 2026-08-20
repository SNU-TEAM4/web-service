import type { ReactNode } from "react";

export interface FloatingFoodImage {
  src: string;
  alt: string;
  position: string;
}

interface FloatingFoodHeroProps {
  children: ReactNode;
  images: FloatingFoodImage[];
}

function Swirls() {
  return (
    <div className="landing-swirls" aria-hidden="true">
      <svg viewBox="0 0 600 600" fill="none"><path d="M515 181C378 52 129 136 51 294S126 600 126 600" /></svg>
      <svg viewBox="0 0 700 700" fill="none"><path d="M27 528C194 690 480 637 594 452S544 2 544 2" /></svg>
    </div>
  );
}

/** Reusable landing hero adapted to the project's CSS-based design system. */
export function FloatingFoodHero({ children, images }: FloatingFoodHeroProps) {
  return (
    <header className="landing landing-with-food">
      <Swirls />
      <div className="floating-foods" aria-hidden="true">
        {images.map((image) => <img key={image.position} src={image.src} alt="" className={`floating-food floating-${image.position}`} />)}
      </div>
      {children}
    </header>
  );
}
