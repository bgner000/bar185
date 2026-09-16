// Renders one real Bar 185 photo: WebP for anything that supports it, the
// original PNG as a fallback. `className` sizes/shapes the picture element
// itself (aspect-ratio, border-radius, height); the <img> always fills it
// via object-fit: cover (see .venue-image rules in site.css).
function VenueImage({ image, className = '', objectPosition, loading = 'lazy', fetchPriority = 'auto' }) {
  return (
    <picture className={`venue-image ${className}`}>
      <source srcSet={image.webp} type="image/webp" />
      <img
        src={image.png}
        alt={image.alt}
        width={image.width}
        height={image.height}
        loading={loading}
        fetchPriority={fetchPriority}
        style={objectPosition ? { objectPosition } : undefined}
      />
    </picture>
  )
}

export default VenueImage
