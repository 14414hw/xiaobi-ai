import { plainify } from '../../src/utils/api.js'

const cases = [
  String.raw`\frac{1}{2}`,
  String.raw`\frac{3}{4}`,
  String.raw`\frac{a}{b}`,
  String.raw`\frac{x+1}{x-1}`,
  String.raw`\frac{1}{x}+\frac{1}{y}`,
  String.raw`\dfrac{1}{2}`,
  String.raw`\frac {1}{2}`,
  String.raw`$\frac{1}{2}$`,
  String.raw`x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}`,
  String.raw`\frac{12}{25}`,
  String.raw`\frac{1}{2}x^2`,
  String.raw`S=\frac{1}{2}ah`,
  String.raw`\frac{\sqrt{3}}{2}`,
  '1/2',
  '3/4',
  '12/25'
]

for (const c of cases) {
  console.log(JSON.stringify(c).padEnd(42), '=>', JSON.stringify(plainify(c)))
}
