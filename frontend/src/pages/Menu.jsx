import { useState } from 'react'
import SectionHead from '../components/SectionHead'
import { menuCategories } from '../data/menu'
import { formatCurrency } from '../lib/format'

function Menu() {
  const [activeCategory, setActiveCategory] = useState(menuCategories[0].id)
  const category = menuCategories.find((item) => item.id === activeCategory)

  return (
    <section className="section">
      <div className="container">
        <SectionHead eyebrow="Menu" title="Cocktails, Wine & Small Plates" center>
          Prices in AUD. Our menu is seasonal and changes throughout the year.
        </SectionHead>

        <div className="menu-tabs" role="tablist" aria-label="Menu categories">
          {menuCategories.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={activeCategory === item.id}
              className={`menu-tab${activeCategory === item.id ? ' active' : ''}`}
              onClick={() => setActiveCategory(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>

        <div className="menu-panel">
          <p className="menu-panel-description">{category.description}</p>

          <ul className="menu-list">
            {category.items.map((item) => (
              <li key={item.name} className="menu-list-item">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.description}</p>
                </div>
                <span className="menu-price">{formatCurrency(item.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export default Menu
