function SectionHead({ eyebrow, title, children, center = false }) {
  return (
    <div className={`section-head${center ? ' center' : ''}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  )
}

export default SectionHead
