import prisma from './prisma';

const products = [
  {
    name: 'Cowboy Duck',
    description: 'A rootin-tootin duck to wrangle your wildest bugs with frontier grit. Perfect for taming unruly code.',
    priceUsd: 2.00,
    imageUrl: '/cowboy-duck.webp',
    stock: 999,
  },
  {
    name: 'Artiste Duck',
    description: 'Brings creative solutions to your debugging sessions. A true master of code aesthetics.',
    priceUsd: 3.00,
    imageUrl: '/artiste-duck.webp',
    stock: 999,
  },
  {
    name: 'Batman Duck',
    description: 'The hero your codebase deserves. Strikes fear into the hearts of bugs everywhere.',
    priceUsd: 5.00,
    imageUrl: '/batman-duck.webp',
    stock: 999,
  },
];

async function main() {
  const existing = await prisma.product.count();
  if (existing > 0) {
    console.log(`Products already seeded (${existing} found), skipping.`);
    return;
  }
  console.log('Seeding products...');
  await prisma.product.createMany({ data: products });
  console.log(`Seeded ${products.length} products`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
