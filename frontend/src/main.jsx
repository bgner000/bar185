import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import './site.css'
import PublicLayout from './layouts/PublicLayout'
import Home from './pages/Home'
import Menu from './pages/Menu'
import Events from './pages/Events'
import About from './pages/About'
import Contact from './pages/Contact'
import Book from './pages/Book'
import AdminDashboard from './admin/AdminDashboard'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/events" element={<Events />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/book" element={<Book />} />
        </Route>

        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
