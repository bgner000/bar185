// Real Bar 185 venue photography. Each entry pairs an optimised WebP (the
// version actually served to modern browsers) with the original PNG as a
// fallback for anything that can't decode WebP, plus dimensions (for
// layout-shift prevention) and accessible alt text. No individual person in
// any photo is identified in the alt text.
import exteriorSignWebp from '../assets/venue/bar185-exterior-sign.webp'
import exteriorSignPng from '../assets/venue/bar185-exterior-sign.png'
import interiorNightWebp from '../assets/venue/bar185-interior-night-atmosphere.webp'
import interiorNightPng from '../assets/venue/bar185-interior-night-atmosphere.png'
import liveMusicStageWebp from '../assets/venue/bar185-live-music-duo-stage.webp'
import liveMusicStagePng from '../assets/venue/bar185-live-music-duo-stage.png'
import liveMusicVerticalWebp from '../assets/venue/bar185-live-music-duo-vertical.webp'
import liveMusicVerticalPng from '../assets/venue/bar185-live-music-duo-vertical.png'
import mainBarAngleWebp from '../assets/venue/bar185-main-bar-angle.webp'
import mainBarAnglePng from '../assets/venue/bar185-main-bar-angle.png'
import mainBarFrontWebp from '../assets/venue/bar185-main-bar-front.webp'
import mainBarFrontPng from '../assets/venue/bar185-main-bar-front.png'
import upstairsEventSpaceWebp from '../assets/venue/bar185-upstairs-event-space.webp'
import upstairsEventSpacePng from '../assets/venue/bar185-upstairs-event-space.png'

export const venueImages = {
  exteriorSign: {
    webp: exteriorSignWebp,
    png: exteriorSignPng,
    alt: 'Entrance to Bar 185 Marrickville',
    width: 730,
    height: 1038,
  },
  interiorNight: {
    webp: interiorNightWebp,
    png: interiorNightPng,
    alt: 'Bar 185 interior at night',
    width: 891,
    height: 638,
  },
  liveMusicStage: {
    webp: liveMusicStageWebp,
    png: liveMusicStagePng,
    alt: 'Live musicians performing on stage at Bar 185',
    width: 896,
    height: 735,
  },
  liveMusicVertical: {
    webp: liveMusicVerticalWebp,
    png: liveMusicVerticalPng,
    alt: 'Live acoustic performance at Bar 185',
    width: 681,
    height: 985,
  },
  mainBarAngle: {
    webp: mainBarAngleWebp,
    png: mainBarAnglePng,
    alt: 'Bar 185 interior with illuminated back bar and seating',
    width: 967,
    height: 1288,
  },
  mainBarFront: {
    webp: mainBarFrontWebp,
    png: mainBarFrontPng,
    alt: 'Bar 185 back bar with spirits, beer taps and chandeliers',
    width: 1656,
    height: 1258,
  },
  upstairsEventSpace: {
    webp: upstairsEventSpaceWebp,
    png: upstairsEventSpacePng,
    alt: 'Upstairs event space at Bar 185',
    width: 928,
    height: 1220,
  },
}
