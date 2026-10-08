# Supplied mascot animations

These vector animation JSON files were extracted from the user's dotLottie archives:

- `flying-bird.json`: `flying bird.lottie`; white background layers hidden to blend with the site.
- `learning.json`: `Learning how to animate.lottie`; artwork preserved; continuous 1.2-second loop with larger hand and coordinated wing movement.
- `duo-attack.json`: `Duo Attack.lottie`; canvas padded by 180 units on each side so the moving wings and sword are not clipped. A parent null translates the artwork without changing its motion.

The client uses lottie-web's SVG renderer, pauses animations outside the viewport or in hidden tabs, and shows a still frame when reduced motion is enabled.
