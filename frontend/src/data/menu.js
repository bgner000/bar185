// Sample menu content. There is no backend menu API yet, so this is
// frontend-only placeholder data — swap it out once a real menu endpoint exists.
export const menuCategories = [
  {
    id: 'cocktails',
    name: 'Cocktails',
    description: 'House classics and Bar 185 originals.',
    items: [
      { name: 'Marrickville Sour', description: 'Bourbon, fig, lemon, egg white', price: 22 },
      { name: 'Illawarra Spritz', description: 'Aperitivo, prosecco, soda, orange', price: 20 },
      { name: 'Smoked Negroni', description: 'Gin, vermouth, campari, cedar smoke', price: 23 },
      { name: 'Native Gimlet', description: 'Vodka, lime, finger lime, native thyme', price: 21 },
      { name: 'Espresso Martini', description: 'Vodka, coffee liqueur, cold brew', price: 21 },
    ],
  },
  {
    id: 'wine',
    name: 'Wine',
    description: 'A rotating list favouring small NSW producers.',
    items: [
      { name: 'House Chardonnay, glass', description: 'Orange, NSW', price: 14 },
      { name: 'House Shiraz, glass', description: 'Hilltops, NSW', price: 14 },
      { name: 'Prosecco, glass', description: 'King Valley, VIC', price: 13 },
      { name: 'Pinot Noir, bottle', description: 'Yarra Valley, VIC', price: 62 },
      { name: 'Rosé, bottle', description: 'Riverina, NSW', price: 48 },
    ],
  },
  {
    id: 'beer',
    name: 'Beer',
    description: 'Local Inner West breweries on tap.',
    items: [
      { name: 'Marrickville Pale Ale', description: 'Local brewery, tap', price: 11 },
      { name: 'Inner West Lager', description: 'Local brewery, tap', price: 10 },
      { name: 'Session IPA', description: 'Local brewery, tap', price: 11 },
      { name: 'Non-Alcoholic Lager', description: 'Bottle', price: 9 },
    ],
  },
  {
    id: 'spirits',
    name: 'Spirits',
    description: 'A considered back bar, poured neat or mixed.',
    items: [
      { name: 'Aged Rum, 30ml', description: 'Caribbean pot-still rum', price: 16 },
      { name: 'Single Malt, 30ml', description: 'Highland single malt', price: 19 },
      { name: 'Australian Gin, 30ml', description: 'Botanical dry gin', price: 15 },
      { name: 'Reposado Tequila, 30ml', description: 'Agave-forward, oak rested', price: 17 },
    ],
  },
  {
    id: 'small-plates',
    name: 'Small Plates',
    description: 'Share plates built for the bar.',
    items: [
      { name: 'Marinated Olives', description: 'Citrus, chilli, rosemary', price: 12 },
      { name: 'Smoked Almonds', description: 'Rosemary salt', price: 9 },
      { name: 'Sourdough & Whipped Butter', description: 'Cultured butter, sea salt', price: 13 },
      { name: 'Crispy Cauliflower', description: 'Nduja honey, pecorino', price: 18 },
      { name: 'Salt & Pepper Squid', description: 'Lime aioli, chilli', price: 22 },
      { name: 'Charcuterie Board', description: 'Cured meats, pickles, crackers', price: 32 },
    ],
  },
]
