/* =============================================================================
   DATA — schemas, fields, operators, worked examples.
   Lifted from the original mockup; icons added per object type.
   ========================================================================== */

const CONTACT_FIELDS = [
  { name: 'email', label: 'Email', type: 'string' },
  { name: 'firstName', label: 'First name', type: 'string' },
  { name: 'lastName', label: 'Last name', type: 'string' },
  { name: 'phone', label: 'Phone', type: 'string' },
  { name: 'status', label: 'Status', type: 'string', enum: ['active', 'churned', 'lead'] },
  { name: 'lifetimeValue', label: 'Lifetime value', type: 'number' },
  { name: 'hipaaConsent', label: 'HIPAA consent', type: 'boolean' },
  { name: 'createdAt', label: 'Created at', type: 'date' },
  { name: 'lastVisitAt', label: 'Last visit at', type: 'date' },
  { name: 'birthday', label: 'Birthday', type: 'date' },
  { name: 'tags', label: 'Tags', type: 'array' },
];

const LINKED_REFS = [
  { id: 'ref-primary-location', name: 'Primary location', fieldPath: 'primaryLocation', cardinality: 'one', targetSchemaId: 'schema-location', targetSchemaName: 'Location' },
  { id: 'ref-account-manager', name: 'Account manager', fieldPath: 'accountManager', cardinality: 'one', targetSchemaId: 'schema-user', targetSchemaName: 'User' },
  { id: 'ref-events-array', name: 'Events attended', fieldPath: 'events', cardinality: 'many', targetSchemaId: 'schema-event', targetSchemaName: 'Event' },
];

const SCHEMA_LINKED_REFS = {
  'schema-trip': [
    { id: 'trip-ref-listing', name: 'Listing', fieldPath: 'listingId', cardinality: 'one', targetSchemaId: 'schema-listing', targetSchemaName: 'Listing' },
  ],
  'schema-transaction': [
    { id: 'transaction-ref-events', name: 'Events', fieldPath: 'eventIds', cardinality: 'many', targetSchemaId: 'schema-event', targetSchemaName: 'Event' },
  ],
};

/* Inbound relationships: another schema points back at Contact. ONE entry per
   schema pair (so the picker shows "Trips" once, not once per back-link). The
   `roles` array holds every distinct back-link between the two schemas — its
   length is what drives the UI: 1 role → the link is implicit (plain text, no
   control); 2+ roles → the user picks which role via an editable chip in the
   block. This generalizes to any business: a Shipment with sender/recipient/
   signedBy is just a 3-role relationship. Each role: { id, phrase, foreignKeyPath }. */
const CHILD_SCHEMAS = [
  { id: 'schema-transaction', name: 'Transactions', targetSchemaId: 'schema-transaction', targetSchemaName: 'Transaction',
    roles: [{ id: 'customer', phrase: 'this contact is the customer', foreignKeyPath: 'customerId' }] },
  { id: 'schema-policy', name: 'Policies', targetSchemaId: 'schema-policy', targetSchemaName: 'Policy',
    roles: [{ id: 'holder', phrase: 'this contact is the policyholder', foreignKeyPath: 'customerId' }] },
  { id: 'schema-order', name: 'Orders', targetSchemaId: 'schema-order', targetSchemaName: 'Order',
    roles: [{ id: 'customer', phrase: 'this contact is the customer', foreignKeyPath: 'customerId' }] },
  { id: 'schema-trip', name: 'Trips', targetSchemaId: 'schema-trip', targetSchemaName: 'Trip',
    roles: [
      { id: 'guest', phrase: 'the contact is a guest', foreignKeyPath: 'guestIds' },
      { id: 'booker', phrase: 'the contact is the booker', foreignKeyPath: 'bookerId' },
    ] },
];

const TARGET_SCHEMA_FIELDS = {
  'schema-location': [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'region', label: 'Region', type: 'string', enum: ['NY', 'NJ', 'CT', 'PA', 'CA'] },
    { name: 'tier', label: 'Tier', type: 'string', enum: ['flagship', 'standard', 'popup'] },
    { name: 'openedAt', label: 'Opened at', type: 'date' },
  ],
  'schema-user': [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'email', label: 'Email', type: 'string' },
    { name: 'role', label: 'Role', type: 'string', enum: ['CSM', 'AE', 'Support'] },
  ],
  'schema-event': [
    { name: 'name', label: 'Name', type: 'string' },
    { name: 'type', label: 'Type', type: 'string', enum: ['Fair', 'Workshop', 'Demo'] },
    { name: 'year', label: 'Year', type: 'number' },
    { name: 'city', label: 'City', type: 'string' },
    { name: 'eventDate', label: 'Event date', type: 'date' },
  ],
  'schema-transaction': [
    { name: 'amount', label: 'Amount', type: 'number' },
    { name: 'status', label: 'Status', type: 'string', enum: ['paid', 'refunded', 'failed'] },
    { name: 'createdAt', label: 'Created at', type: 'date' },
    { name: 'productName', label: 'Product name', type: 'string' },
    { name: 'eventIds', label: 'Events', type: 'array' },
  ],
  'schema-policy': [
    { name: 'status', label: 'Status', type: 'string', enum: ['active', 'expired', 'cancelled'] },
    { name: 'premium', label: 'Premium', type: 'number' },
    { name: 'renewalDate', label: 'Renewal date', type: 'date' },
  ],
  'schema-order': [
    { name: 'total', label: 'Total', type: 'number' },
    { name: 'channel', label: 'Channel', type: 'string', enum: ['web', 'pos', 'phone'] },
    { name: 'placedAt', label: 'Placed at', type: 'date' },
  ],
  'schema-trip': [
    { name: 'tripDate', label: 'Trip date', type: 'date' },
    { name: 'guideName', label: 'Guide name', type: 'string' },
    { name: 'status', label: 'Status', type: 'string', enum: ['booked', 'completed', 'cancelled'] },
  ],
  'schema-listing': [
    { name: 'name', label: 'Name', type: 'string', enum: ['Fruita Single Track', 'Moab Single Track', 'Vail Downhill MTB', 'Moab Slickrock'] },
    { name: 'type', label: 'Type', type: 'string', enum: ['MTB', 'Downhill', 'Gravel', 'Road'] },
    { name: 'difficulty', label: 'Difficulty', type: 'string', enum: ['easy', 'moderate', 'hard', 'expert'] },
    { name: 'region', label: 'Region', type: 'string' },
  ],
};

const OPERATORS = {
  string: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'contains', label: 'contains' },
    { value: 'not_contains', label: 'does not contain' },
    { value: 'in', label: 'is any of' },
    { value: 'exists', label: 'has any value' },
    { value: 'not_exists', label: 'is empty' },
  ],
  number: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'greater_than', label: 'is more than' },
    { value: 'less_than', label: 'is less than' },
    { value: 'exists', label: 'has any value' },
    { value: 'not_exists', label: 'is empty' },
  ],
  boolean: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'exists', label: 'has any value' },
    { value: 'not_exists', label: 'is empty' },
  ],
  date: [
    { value: 'greater_than', label: 'is after' },
    { value: 'less_than', label: 'is before' },
    { value: 'equals_month_day', label: 'is on (month/day)' },
    { value: 'equals_month_day_year', label: 'is exactly' },
    { value: 'between_month_day', label: 'is between (month/day)' },
    { value: 'between_month_day_year', label: 'is between' },
    { value: 'not_equals', label: 'is not' },
    { value: 'exists', label: 'has any value' },
    { value: 'not_exists', label: 'is empty' },
  ],
  array: [{ value: 'array_contains', label: 'includes' }],
  unknown: [
    { value: 'equals', label: 'is' },
    { value: 'not_equals', label: 'is not' },
    { value: 'exists', label: 'has any value' },
    { value: 'not_exists', label: 'is empty' },
  ],
};

const COUNT_OPERATORS = [
  { value: 'gte', label: 'at least' },
  { value: 'gt', label: 'more than' },
  { value: 'eq', label: 'exactly' },
  { value: 'lt', label: 'fewer than' },
  { value: 'lte', label: 'at most' },
];

/* ---- Icon set (inline SVG paths keyed by schema id / well-known names) ---- */
const ICONS = {
  contact: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="2.6" stroke="currentColor" stroke-width="1.4"/><path d="M3 13c0-2.2 2.2-3.6 5-3.6s5 1.4 5 3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  location: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 14.5c3-3.2 4.5-5.6 4.5-8a4.5 4.5 0 1 0-9 0c0 2.4 1.5 4.8 4.5 8z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="6.5" r="1.6" stroke="currentColor" stroke-width="1.4"/></svg>',
  user: '<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5" r="2.6" stroke="currentColor" stroke-width="1.4"/><path d="M3 13c0-2.2 2.2-3.6 5-3.6s5 1.4 5 3.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  event: '<svg viewBox="0 0 16 16" fill="none"><path d="M2.5 6.5h11M4.5 2.5v2M11.5 2.5v2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><rect x="2.5" y="3.5" width="11" height="10" rx="1.6" stroke="currentColor" stroke-width="1.4"/></svg>',
  transaction: '<svg viewBox="0 0 16 16" fill="none"><path d="M3.5 2.5h9v11l-1.8-1.2-1.6 1.2L7.5 12.3 5.9 13.5 4.3 12.3 3.5 13z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 6h4M6 8.5h4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  policy: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2l5 2v4c0 3-2.2 5.2-5 6.2C5.2 13.2 3 11 3 8V4z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 8l1.4 1.4L10 6.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  order: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 5h10l-.8 8.2a1 1 0 0 1-1 .9H4.8a1 1 0 0 1-1-.9z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M5.6 5V4a2.4 2.4 0 0 1 4.8 0v1" stroke="currentColor" stroke-width="1.4"/></svg>',
  trip: '<svg viewBox="0 0 16 16" fill="none"><path d="M2.5 4.5l3.5-1.5 4 1.5 3.5-1.5v9l-3.5 1.5-4-1.5-3.5 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M6 3v9.5M10 4.5V14" stroke="currentColor" stroke-width="1.4"/></svg>',
  listing: '<svg viewBox="0 0 16 16" fill="none"><path d="M8.5 2.5H13v4.5l-6 6L2.5 8.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="10.3" cy="5.2" r="1" fill="currentColor"/></svg>',
  generic: '<svg viewBox="0 0 16 16" fill="none"><path d="M6.5 9.5a3 3 0 0 0 4.243 0l2.121-2.121a3 3 0 0 0-4.243-4.243L7.5 4.25M9.5 6.5a3 3 0 0 0-4.243 0L3.136 8.621a3 3 0 0 0 4.243 4.243L8.5 11.75" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
};

function iconForSchema(schemaId, schemaName) {
  const map = {
    'schema-location': 'location', 'schema-user': 'user', 'schema-event': 'event',
    'schema-transaction': 'transaction', 'schema-policy': 'policy', 'schema-order': 'order',
    'schema-trip': 'trip', 'schema-listing': 'listing',
  };
  return ICONS[map[schemaId]] || ICONS.generic;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const EXAMPLES = {
  empty() { return { groups: [{ id: uid(), logic: 'and', conditions: [] }] }; },
  fairs() {
    return {
      groups: [{
        id: uid(), logic: 'and',
        conditions: [
          {
            id: uid(), kind: 'related', linkShape: 'child', sourceId: 'schema-transaction',
            displayName: 'Transactions', targetSchemaId: 'schema-transaction', targetSchemaName: 'Transaction',
            inclusionMode: 'has', countOperator: 'gte', countValue: 1,
            conditions: [{
              id: uid(), kind: 'related', linkShape: 'array_ref', sourceId: 'transaction-ref-events',
              displayName: 'Events', targetSchemaId: 'schema-event', targetSchemaName: 'Event',
              inclusionMode: 'has', countOperator: 'gte', countValue: 1, parentSchemaId: 'schema-transaction',
              conditions: [
                { id: uid(), kind: 'field', field: 'type', fieldType: 'string', operator: 'equals', value: ['Fair'] },
                { id: uid(), kind: 'field', field: 'name', fieldType: 'string', operator: 'equals', value: ['Brooklyn Bridge Fair'] },
                { id: uid(), kind: 'field', field: 'year', fieldType: 'number', operator: 'less_than', value: [2026] },
              ],
            }],
          },
          {
            id: uid(), kind: 'related', linkShape: 'child', sourceId: 'schema-transaction',
            displayName: 'Transactions', targetSchemaId: 'schema-transaction', targetSchemaName: 'Transaction',
            inclusionMode: 'none', countOperator: 'eq', countValue: 0,
            conditions: [{
              id: uid(), kind: 'related', linkShape: 'array_ref', sourceId: 'transaction-ref-events',
              displayName: 'Events', targetSchemaId: 'schema-event', targetSchemaName: 'Event',
              inclusionMode: 'has', countOperator: 'gte', countValue: 1, parentSchemaId: 'schema-transaction',
              conditions: [
                { id: uid(), kind: 'field', field: 'name', fieldType: 'string', operator: 'equals', value: ['Brooklyn Bridge Fair'] },
                { id: uid(), kind: 'field', field: 'year', fieldType: 'number', operator: 'equals', value: [2026] },
              ],
            }],
          },
        ],
      }],
    };
  },
  location() {
    return {
      groups: [{
        id: uid(), logic: 'and',
        conditions: [
          {
            id: uid(), kind: 'related', linkShape: 'single_ref', sourceId: 'ref-primary-location',
            displayName: 'Primary location', targetSchemaId: 'schema-location', targetSchemaName: 'Location',
            inclusionMode: 'has', countOperator: 'gte', countValue: 1,
            conditions: [
              { id: uid(), kind: 'field', field: 'region', fieldType: 'string', operator: 'equals', value: ['NY'] },
              { id: uid(), kind: 'field', field: 'tier', fieldType: 'string', operator: 'equals', value: ['flagship'] },
            ],
          },
          { id: uid(), kind: 'field', field: 'lifetimeValue', fieldType: 'number', operator: 'greater_than', value: [500] },
        ],
      }],
    };
  },
  anycreek() {
    return {
      groups: [{
        id: uid(), logic: 'and',
        conditions: [
          /* 1 + 2: has >=1 trip AS GUEST whose listing is one of {Fruita, Moab} */
          {
            id: uid(), kind: 'related', linkShape: 'child', sourceId: 'schema-trip',
            displayName: 'Trips', targetSchemaId: 'schema-trip', targetSchemaName: 'Trip', roleId: 'guest',
            inclusionMode: 'has', countOperator: 'gte', countValue: 1,
            conditions: [{
              id: uid(), kind: 'related', linkShape: 'single_ref', sourceId: 'trip-ref-listing',
              displayName: 'Listing', targetSchemaId: 'schema-listing', targetSchemaName: 'Listing',
              inclusionMode: 'has', countOperator: 'gte', countValue: 1, parentSchemaId: 'schema-trip',
              conditions: [
                { id: uid(), kind: 'field', field: 'name', fieldType: 'string', operator: 'in', value: ['Fruita Single Track', 'Moab Single Track'] },
              ],
            }],
          },
          /* 3: has NO trip as guest in the last 180 days (i.e. last trip is old) */
          {
            id: uid(), kind: 'related', linkShape: 'child', sourceId: 'schema-trip',
            displayName: 'Trips', targetSchemaId: 'schema-trip', targetSchemaName: 'Trip', roleId: 'guest',
            inclusionMode: 'none', countOperator: 'eq', countValue: 0,
            conditions: [
              { id: uid(), kind: 'field', field: 'tripDate', fieldType: 'date', operator: 'greater_than', value: ['180 days ago'] },
            ],
          },
          /* 4: has NO upcoming trips as guest */
          {
            id: uid(), kind: 'related', linkShape: 'child', sourceId: 'schema-trip',
            displayName: 'Trips', targetSchemaId: 'schema-trip', targetSchemaName: 'Trip', roleId: 'guest',
            inclusionMode: 'none', countOperator: 'eq', countValue: 0,
            conditions: [
              { id: uid(), kind: 'field', field: 'tripDate', fieldType: 'date', operator: 'greater_than', value: ['today'] },
            ],
          },
        ],
      }],
    };
  },
  hipaa() {
    return {
      groups: [{
        id: uid(), logic: 'and',
        conditions: [
          { id: uid(), kind: 'field', field: 'hipaaConsent', fieldType: 'boolean', operator: 'equals', value: [true] },
          {
            id: uid(), kind: 'nested', logic: 'or',
            conditions: [
              { id: uid(), kind: 'field', field: 'lastVisitAt', fieldType: 'date', operator: 'greater_than', value: ['30 days ago'] },
              {
                id: uid(), kind: 'related', linkShape: 'child', sourceId: 'schema-policy',
                displayName: 'Policies', targetSchemaId: 'schema-policy', targetSchemaName: 'Policy',
                inclusionMode: 'has', countOperator: 'gte', countValue: 1,
                conditions: [
                  { id: uid(), kind: 'field', field: 'status', fieldType: 'string', operator: 'equals', value: ['active'] },
                ],
              },
            ],
          },
        ],
      }],
    };
  },
};

const EXAMPLE_META = {
  fairs: { label: 'Fairs.com: lapsed attendees', title: 'Lapsed Fairs.com attendees', desc: 'Define which contacts belong to "Lapsed Fairs.com attendees".' },
  location: { label: 'Primary location: Brooklyn', title: 'Brooklyn flagship regulars', desc: 'Define which contacts belong to "Brooklyn flagship regulars".' },
  hipaa: { label: 'HIPAA-consented + recent visit', title: 'HIPAA-consented, recently active', desc: 'Define which contacts belong to "HIPAA-consented, recently active".' },
  anycreek: { label: 'Anycreek: trip → listing name', title: 'Fruita trail riders', desc: 'Define which contacts belong to "Fruita trail riders".' },
  empty: { label: 'Start blank', title: 'Untitled segment', desc: 'Define which contacts belong to this segment.' },
};
