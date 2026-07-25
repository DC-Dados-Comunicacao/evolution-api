import { Logger } from '@config/logger.config';

/**
 * Rule-based classifier that maps a supermarket item description to a spending
 * category. It is intentionally dependency-free (no external API) so that
 * categorization works even without an LLM configured. Descriptions from
 * Brazilian receipts are frequently abbreviated/uppercased, so matching is
 * done over a normalized (lowercased, accent-stripped) string.
 */

export const SUPERMARKET_CATEGORIES = [
  'Hortifruti',
  'Carnes e Aves',
  'Peixes e Frutos do Mar',
  'Padaria',
  'Laticínios e Frios',
  'Mercearia',
  'Bebidas',
  'Bebidas Alcoólicas',
  'Doces e Snacks',
  'Congelados',
  'Higiene e Beleza',
  'Limpeza',
  'Pet',
  'Bebê',
  'Outros',
] as const;

export type SupermarketCategory = (typeof SUPERMARKET_CATEGORIES)[number];

const DEFAULT_CATEGORY: SupermarketCategory = 'Outros';

// Order matters: the first category whose keywords match wins. More specific
// categories (e.g. alcoholic drinks vs. drinks) are listed before broader ones.
const CATEGORY_RULES: { category: SupermarketCategory; keywords: string[] }[] = [
  {
    category: 'Bebidas Alcoólicas',
    keywords: [
      'cerveja',
      'chopp',
      'vinho',
      'espumante',
      'whisky',
      'whiskey',
      'vodka',
      'cachaca',
      'pinga',
      'gin',
      'rum',
      'tequila',
      'licor',
      'aperitivo',
      'ipa',
      'lager',
    ],
  },
  {
    category: 'Peixes e Frutos do Mar',
    keywords: [
      'peixe',
      'tilapia',
      'salmao',
      'bacalhau',
      'sardinha',
      'atum',
      'camarao',
      'lula',
      'polvo',
      'merluza',
      'pescada',
      'file de peixe',
    ],
  },
  {
    category: 'Carnes e Aves',
    keywords: [
      'carne',
      'bovin',
      'boi',
      'patinho',
      'alcatra',
      'coxao',
      'acem',
      'picanha',
      'costela',
      'file mignon',
      'frango',
      'coxa',
      'sobrecoxa',
      'peito de frango',
      'asa',
      'suin',
      'porco',
      'pernil',
      'linguica',
      'bacon',
      'salsicha',
      'carne moida',
      'hamburguer',
      'peru',
      'ma de vaca',
    ],
  },
  {
    category: 'Laticínios e Frios',
    keywords: [
      'leite',
      'queijo',
      'mussarela',
      'muzzarela',
      'prato',
      'requeijao',
      'iogurte',
      'manteiga',
      'margarina',
      'creme de leite',
      'nata',
      'presunto',
      'mortadela',
      'salame',
      'peito de peru',
      'catupiry',
      'cream cheese',
      'ricota',
    ],
  },
  {
    category: 'Padaria',
    keywords: ['pao', 'baguete', 'bisnaga', 'sonho', 'bolo', 'rosca', 'croissant', 'torrada', 'panetone', 'padaria'],
  },
  {
    category: 'Hortifruti',
    keywords: [
      'banana',
      'maca',
      'laranja',
      'limao',
      'mamao',
      'melancia',
      'melao',
      'uva',
      'abacaxi',
      'manga',
      'morango',
      'pera',
      'tomate',
      'alface',
      'cebola',
      'batata',
      'cenoura',
      'alho',
      'pimentao',
      'abobrinha',
      'brocolis',
      'couve',
      'repolho',
      'mandioca',
      'verdura',
      'legume',
      'fruta',
      'hortifruti',
      'salsa',
      'cheiro verde',
    ],
  },
  {
    category: 'Congelados',
    keywords: [
      'congelado',
      'nuggets',
      'lasanha',
      'pizza congelada',
      'empanado',
      'batata palito',
      'polpa',
      'sorvete',
      'acai',
      'hamburguer congelado',
    ],
  },
  {
    category: 'Doces e Snacks',
    keywords: [
      'chocolate',
      'bombom',
      'bala',
      'chiclete',
      'biscoito',
      'bolacha',
      'salgadinho',
      'batata frita',
      'doce',
      'gelatina',
      'pipoca',
      'wafer',
      'cookie',
      'brigadeiro',
      'pacoca',
    ],
  },
  {
    category: 'Bebidas',
    keywords: [
      'refrigerante',
      'coca',
      'guarana',
      'fanta',
      'sprite',
      'suco',
      'agua',
      'agua mineral',
      'energetico',
      'cha ',
      'cafe',
      'nescau',
      'achocolatado',
      'isotonico',
      'refresco',
    ],
  },
  {
    category: 'Higiene e Beleza',
    keywords: [
      'sabonete',
      'shampoo',
      'condicionador',
      'creme dental',
      'pasta de dente',
      'escova de dente',
      'desodorante',
      'papel higienico',
      'absorvente',
      'fralda geriatrica',
      'barbeador',
      'gilette',
      'hidratante',
      'algodao',
      'cotonete',
      'fio dental',
    ],
  },
  {
    category: 'Limpeza',
    keywords: [
      'detergente',
      'sabao',
      'amaciante',
      'agua sanitaria',
      'desinfetante',
      'alvejante',
      'limpador',
      'multiuso',
      'esponja',
      'papel toalha',
      'saco de lixo',
      'lustra',
      'cera',
      'veja',
      'ype',
    ],
  },
  {
    category: 'Pet',
    keywords: ['racao', 'petisco', 'areia gato', 'sache', 'pet ', 'cachorro', 'gato', 'osso'],
  },
  {
    category: 'Bebê',
    keywords: ['fralda', 'lenco umedecido', 'papinha', 'formula infantil', 'mamadeira', 'bebe'],
  },
  {
    category: 'Mercearia',
    keywords: [
      'arroz',
      'feijao',
      'macarrao',
      'oleo',
      'azeite',
      'acucar',
      'sal',
      'farinha',
      'molho',
      'extrato',
      'ketchup',
      'maionese',
      'mostarda',
      'tempero',
      'caldo',
      'milho',
      'ervilha',
      'seleta',
      'atomatado',
      'vinagre',
      'fuba',
      'aveia',
      'granola',
      'cereal',
      'leite condensado',
      'trigo',
      'amido',
      'gelatina po',
      'tapioca',
    ],
  },
];

export class SupermarketCategoryService {
  private readonly logger = new Logger('SupermarketCategoryService');

  private normalize(text: string): string {
    return (text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Classify a single item description into one of SUPERMARKET_CATEGORIES.
   * Returns 'Outros' when nothing matches.
   */
  public classify(description: string): SupermarketCategory {
    const normalized = this.normalize(description);

    if (!normalized) {
      return DEFAULT_CATEGORY;
    }

    for (const rule of CATEGORY_RULES) {
      if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
        return rule.category;
      }
    }

    return DEFAULT_CATEGORY;
  }

  /**
   * Validate/normalize a category coming from an external source (e.g. an LLM).
   * Falls back to keyword classification and then to 'Outros'.
   */
  public normalizeCategory(candidate: string | undefined, description: string): SupermarketCategory {
    if (candidate) {
      const match = SUPERMARKET_CATEGORIES.find(
        (category) => this.normalize(category) === this.normalize(candidate),
      );
      if (match) {
        return match;
      }
    }

    return this.classify(description);
  }
}
