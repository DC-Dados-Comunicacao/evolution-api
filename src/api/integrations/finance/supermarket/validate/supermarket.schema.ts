import { JSONSchema7 } from 'json-schema';

const isNotEmpty = (...properties: string[]): JSONSchema7 => {
  const obj: JSONSchema7 = {};
  properties.forEach((property) => {
    obj[property] = {
      minLength: 1,
      description: `The "${property}" cannot be empty`,
    };
  });
  return {
    if: {
      propertyNames: {
        enum: [...properties],
      },
    },
    then: { properties: obj },
  } as unknown as JSONSchema7;
};

export const ingestReceiptSchema: JSONSchema7 = {
  $id: 'ingestReceiptSchema',
  type: 'object',
  properties: {
    url: { type: 'string' },
    base64: { type: 'string' },
    mimeType: { type: 'string' },
    imageUrl: { type: 'string' },
    remoteJid: { type: 'string' },
    openaiApiKey: { type: 'string' },
    openaiModel: { type: 'string' },
  },
  anyOf: [{ required: ['url'] }, { required: ['base64'] }, { required: ['imageUrl'] }],
};

export const manualReceiptSchema: JSONSchema7 = {
  $id: 'manualReceiptSchema',
  type: 'object',
  properties: {
    storeName: { type: 'string' },
    storeCnpj: { type: 'string' },
    purchaseDate: { type: 'string' },
    remoteJid: { type: 'string' },
    items: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          description: { type: 'string', minLength: 1 },
          category: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          unitPrice: { type: 'number' },
          totalPrice: { type: 'number' },
        },
        required: ['description'],
        ...isNotEmpty('description'),
      },
    },
  },
  required: ['items'],
};
