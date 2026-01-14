// Debug the stripTags function

const CLAN_TAGS = ['ᵃⁿᵍ', 'ᵏᵏ', 'кк', 'К҉к҉', 'K҉k҉', '๛', 'ᴬᶜ', '҉', 'ккк', 'ᵏᵏᵏ'];

function stripTags(name: string): string {
  let clean = name;
  for (const tag of CLAN_TAGS) {
    clean = clean.replaceAll(tag, '');
  }
  clean = clean.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
  return clean.trim().toLowerCase();
}

const testNames = [
  'Fluffy',
  'ᵃⁿᵍFluffy',
  'cloud',
  'ᵃⁿᵍ cloud',
];

console.log('Testing stripTags:');
testNames.forEach(name => {
  const stripped = stripTags(name);
  console.log(`  "${name}" -> "${stripped}"`);
});

// Check if Fluffy matches
const f1 = stripTags('Fluffy');
const f2 = stripTags('ᵃⁿᵍFluffy');
console.log('\nFluffy comparison:');
console.log(`  stripTags("Fluffy") = "${f1}"`);
console.log(`  stripTags("ᵃⁿᵍFluffy") = "${f2}"`);
console.log(`  Equal: ${f1 === f2}`);
