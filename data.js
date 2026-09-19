// TubeQuest station data
// Station lists are grouped by line. Interchange stations appear in every
// line they serve; visited state is tracked per unique station name.

const TUBE_LINES = [
  {
    key: "bakerloo",
    name: "Bakerloo",
    mode: "underground",
    color: "#B36305",
    stations: [
      "Harrow & Wealdstone", "Kenton", "South Kenton", "North Wembley",
      "Wembley Central", "Stonebridge Park", "Harlesden", "Willesden Junction",
      "Kensal Green", "Queen's Park", "Kilburn Park", "Maida Vale",
      "Warwick Avenue", "Paddington", "Edgware Road", "Marylebone",
      "Baker Street", "Regent's Park", "Oxford Circus", "Piccadilly Circus",
      "Charing Cross", "Embankment", "Waterloo", "Lambeth North",
      "Elephant & Castle"
    ]
  },
  {
    key: "central",
    name: "Central",
    mode: "underground",
    color: "#E32017",
    stations: [
      "West Ruislip", "Ruislip Gardens", "South Ruislip", "Northolt",
      "Greenford", "Perivale", "Hanger Lane", "North Acton", "East Acton",
      "White City", "Shepherd's Bush", "Holland Park", "Notting Hill Gate",
      "Queensway", "Lancaster Gate", "Marble Arch", "Bond Street",
      "Oxford Circus", "Tottenham Court Road", "Holborn", "Chancery Lane",
      "St. Paul's", "Bank", "Liverpool Street", "Bethnal Green", "Mile End",
      "Stratford", "Leyton", "Leytonstone", "Snaresbrook", "South Woodford",
      "Woodford", "Buckhurst Hill", "Loughton", "Debden", "Theydon Bois",
      "Epping", "Wanstead", "Redbridge", "Gants Hill", "Newbury Park",
      "Barkingside", "Fairlop", "Hainault", "Grange Hill", "Chigwell",
      "Roding Valley", "West Acton", "North Ealing", "Ealing Common",
      "Ealing Broadway"
    ]
  },
  {
    key: "circle",
    name: "Circle",
    mode: "underground",
    color: "#FFD300",
    stations: [
      "Hammersmith", "Goldhawk Road", "Shepherd's Bush Market", "Wood Lane",
      "Latimer Road", "Ladbroke Grove", "Westbourne Park", "Royal Oak",
      "Paddington", "Edgware Road", "Baker Street", "Great Portland Street",
      "Euston Square", "King's Cross St. Pancras", "Farringdon", "Barbican",
      "Moorgate", "Liverpool Street", "Aldgate", "Tower Hill", "Monument",
      "Cannon Street", "Mansion House", "Blackfriars", "Temple", "Embankment",
      "Westminster", "St. James's Park", "Victoria", "Sloane Square",
      "South Kensington", "Gloucester Road", "High Street Kensington",
      "Notting Hill Gate", "Bayswater"
    ]
  },
  {
    key: "district",
    name: "District",
    mode: "underground",
    color: "#00782A",
    stations: [
      "Upminster", "Hornchurch", "Elm Park", "Dagenham East",
      "Dagenham Heathway", "Becontree", "Upney", "Barking", "East Ham",
      "Upton Park", "Plaistow", "West Ham", "Bromley-by-Bow", "Bow Road",
      "Mile End", "Stepney Green", "Whitechapel", "Aldgate East", "Tower Hill",
      "Monument", "Cannon Street", "Mansion House", "Blackfriars", "Temple",
      "Embankment", "Westminster", "St. James's Park", "Victoria",
      "Sloane Square", "South Kensington", "Gloucester Road",
      "High Street Kensington", "Earl's Court", "West Brompton",
      "Fulham Broadway", "Parsons Green", "Putney Bridge", "East Putney",
      "Southfields", "Wimbledon Park", "Wimbledon", "Kensington (Olympia)",
      "Ravenscourt Park", "Stamford Brook", "Turnham Green", "Chiswick Park",
      "Acton Town", "Gunnersbury", "Kew Gardens", "Richmond", "Ealing Common",
      "Ealing Broadway"
    ]
  },
  {
    key: "hammersmith-city",
    name: "Hammersmith & City",
    mode: "underground",
    color: "#F3A9BB",
    stations: [
      "Hammersmith", "Goldhawk Road", "Shepherd's Bush Market", "Wood Lane",
      "Latimer Road", "Ladbroke Grove", "Westbourne Park", "Royal Oak",
      "Paddington", "Edgware Road", "Baker Street", "Great Portland Street",
      "Euston Square", "King's Cross St. Pancras", "Farringdon", "Barbican",
      "Moorgate", "Liverpool Street", "Aldgate East", "Whitechapel",
      "Stepney Green", "Mile End", "Bow Road", "Bromley-by-Bow", "West Ham",
      "Plaistow", "Upton Park", "East Ham", "Barking"
    ]
  },
  {
    key: "jubilee",
    name: "Jubilee",
    mode: "underground",
    color: "#A0A5A9",
    stations: [
      "Stanmore", "Canons Park", "Queensbury", "Kingsbury", "Wembley Park",
      "Neasden", "Dollis Hill", "Willesden Green", "Kilburn", "West Hampstead",
      "Finchley Road", "Swiss Cottage", "St. John's Wood", "Baker Street",
      "Bond Street", "Green Park", "Westminster", "Waterloo", "Southwark",
      "London Bridge", "Bermondsey", "Canada Water", "Canary Wharf",
      "North Greenwich", "Canning Town", "West Ham", "Stratford"
    ]
  },
  {
    key: "metropolitan",
    name: "Metropolitan",
    mode: "underground",
    color: "#9B0056",
    stations: [
      "Aldgate", "Liverpool Street", "Moorgate", "Barbican", "Farringdon",
      "King's Cross St. Pancras", "Euston Square", "Great Portland Street",
      "Baker Street", "Finchley Road", "Wembley Park", "Preston Road",
      "Northwick Park", "Harrow-on-the-Hill", "North Harrow", "Pinner",
      "Northwood Hills", "Northwood", "Moor Park", "Rickmansworth",
      "Chorleywood", "Chalfont & Latimer", "Chesham", "Amersham",
      "West Harrow", "Rayners Lane", "Eastcote", "Ruislip Manor", "Ruislip",
      "Ickenham", "Hillingdon", "Uxbridge"
    ]
  },
  {
    key: "northern",
    name: "Northern",
    mode: "underground",
    color: "#000000",
    stations: [
      "Edgware", "Burnt Oak", "Colindale", "Hendon Central", "Brent Cross",
      "Golders Green", "Hampstead", "Belsize Park", "Chalk Farm",
      "Camden Town", "Mornington Crescent", "Euston", "Warren Street",
      "Goodge Street", "Tottenham Court Road", "Leicester Square",
      "Charing Cross", "Embankment", "Waterloo", "Kennington",
      "King's Cross St. Pancras", "Angel", "Old Street", "Moorgate", "Bank",
      "London Bridge", "Borough", "Elephant & Castle", "Oval", "Stockwell",
      "Clapham North", "Clapham Common", "Clapham South", "Balham",
      "Tooting Bec", "Tooting Broadway", "Colliers Wood", "South Wimbledon",
      "Morden", "Kentish Town", "Tufnell Park", "Archway", "Highgate",
      "East Finchley", "Finchley Central", "West Finchley", "Woodside Park",
      "Totteridge & Whetstone", "High Barnet", "Mill Hill East",
      "Nine Elms", "Battersea Power Station"
    ]
  },
  {
    key: "piccadilly",
    name: "Piccadilly",
    mode: "underground",
    color: "#003688",
    stations: [
      "Cockfosters", "Oakwood", "Southgate", "Arnos Grove", "Bounds Green",
      "Wood Green", "Turnpike Lane", "Manor House", "Finsbury Park",
      "Arsenal", "Holloway Road", "Caledonian Road", "King's Cross St. Pancras",
      "Russell Square", "Holborn", "Covent Garden", "Leicester Square",
      "Piccadilly Circus", "Green Park", "Hyde Park Corner", "Knightsbridge",
      "South Kensington", "Gloucester Road", "Earl's Court", "Barons Court",
      "Hammersmith", "Turnham Green", "Acton Town", "Ealing Common",
      "North Ealing", "Park Royal", "Alperton", "Sudbury Town",
      "Sudbury Hill", "South Harrow", "Rayners Lane", "Eastcote",
      "Ruislip Manor", "Ruislip", "Ickenham", "Hillingdon", "Uxbridge",
      "South Ealing", "Northfields", "Boston Manor", "Osterley",
      "Hounslow East", "Hounslow Central", "Hounslow West", "Hatton Cross",
      "Heathrow Terminals 2 & 3", "Heathrow Terminal 5", "Heathrow Terminal 4"
    ]
  },
  {
    key: "victoria",
    name: "Victoria",
    mode: "underground",
    color: "#0098D4",
    stations: [
      "Brixton", "Stockwell", "Vauxhall", "Pimlico", "Victoria", "Green Park",
      "Oxford Circus", "Warren Street", "Euston", "King's Cross St. Pancras",
      "Highbury & Islington", "Finsbury Park", "Seven Sisters",
      "Tottenham Hale", "Blackhorse Road", "Walthamstow Central"
    ]
  },
  {
    key: "waterloo-city",
    name: "Waterloo & City",
    mode: "underground",
    color: "#95CDBA",
    stations: ["Waterloo", "Bank"]
  },
  {
    key: "liberty",
    name: "Liberty",
    mode: "overground",
    color: "#6F7C85",
    stations: ["Upminster", "Emerson Park", "Romford"]
  },
  {
    key: "lioness",
    name: "Lioness",
    mode: "overground",
    color: "#F2A900",
    stations: [
      "Watford Junction", "Bushey", "Carpenders Park", "Hatch End",
      "Headstone Lane", "Harrow & Wealdstone", "Kenton", "South Kenton",
      "North Wembley", "Wembley Central", "Stonebridge Park", "Harlesden",
      "Willesden Junction", "Kensal Green", "Queen's Park",
      "Kilburn High Road", "South Hampstead", "Euston"
    ]
  },
  {
    key: "mildmay",
    name: "Mildmay",
    mode: "overground",
    color: "#0072BC",
    stations: [
      "Richmond", "Kew Gardens", "Gunnersbury", "South Acton",
      "Acton Central", "Willesden Junction", "Kensal Rise",
      "Brondesbury Park", "Brondesbury", "West Hampstead", "Finchley Road & Frognal",
      "Hampstead Heath", "Gospel Oak", "Kentish Town West", "Camden Road",
      "Caledonian Road & Barnsbury", "Highbury & Islington", "Canonbury",
      "Dalston Junction", "Haggerston", "Hoxton", "Shoreditch High Street",
      "Whitechapel"
    ]
  },
  {
    key: "suffragette",
    name: "Suffragette",
    mode: "overground",
    color: "#40A78A",
    stations: [
      "Gospel Oak", "Upper Holloway", "Crouch Hill", "Harringay Green Lanes",
      "South Tottenham", "Blackhorse Road", "Walthamstow Queen's Road",
      "Leyton Midland Road", "Leytonstone High Road", "Wanstead Park",
      "Woodgrange Park", "Barking"
    ]
  },
  {
    key: "weaver",
    name: "Weaver",
    mode: "overground",
    color: "#A6194E",
    stations: [
      "Liverpool Street", "Bethnal Green", "Cambridge Heath", "London Fields",
      "Hackney Central", "Homerton", "Hackney Wick", "Stratford",
      "Maryland", "Forest Gate", "Manor Park", "Ilford", "Seven Kings",
      "Goodmayes", "Chadwell Heath", "Romford", "Gidea Park", "Harold Wood",
      "Brentwood", "Shenfield"
    ]
  },
  {
    key: "windrush",
    name: "Windrush",
    mode: "overground",
    color: "#DC241F",
    stations: [
      "Highbury & Islington", "Canonbury", "Dalston Junction",
      "Dalston Kingsland", "Hackney Central", "Homerton", "Hackney Wick",
      "Shoreditch High Street", "Whitechapel", "Surrey Quays",
      "New Cross Gate", "New Cross", "Queens Road Peckham", "Peckham Rye",
      "Denmark Hill", "Clapham High Street", "Wandsworth Road",
      "Clapham Junction", "West Croydon", "Norwood Junction",
      "Anerley", "Crystal Palace", "Sydenham", "Forest Hill", "Honor Oak Park",
      "Brockley"
    ]
  },
  {
    key: "dlr",
    name: "DLR",
    mode: "dlr",
    color: "#00A4A7",
    stations: [
      "Bank", "Tower Gateway", "Shadwell", "Limehouse", "Westferry",
      "Poplar", "All Saints", "Blackwall", "East India", "Canning Town",
      "West Ham", "Stratford", "Stratford International", "Bow Church",
      "Devons Road", "Langdon Park", "Pudding Mill Lane", "Canary Wharf",
      "Heron Quays", "South Quay", "Crossharbour", "Mudchute",
      "Island Gardens", "Cutty Sark", "Greenwich", "Deptford Bridge",
      "Elverson Road", "Lewisham", "Prince Regent", "Custom House",
      "Royal Victoria", "Royal Albert", "Beckton Park", "Cyprus",
      "Gallions Reach", "Beckton", "Woolwich Arsenal", "King George V",
      "London City Airport"
    ]
  },
  {
    key: "elizabeth",
    name: "Elizabeth line",
    mode: "elizabeth",
    color: "#6950A1",
    stations: [
      "Reading", "Twyford", "Maidenhead", "Taplow", "Burnham", "Slough",
      "Langley", "Iver", "West Drayton", "Hayes & Harlington", "Southall",
      "Hanwell", "West Ealing", "Ealing Broadway", "Acton Main Line",
      "Paddington", "Bond Street", "Tottenham Court Road", "Farringdon",
      "Liverpool Street", "Whitechapel", "Canary Wharf", "Custom House",
      "Woolwich", "Abbey Wood", "Stratford", "Maryland", "Forest Gate",
      "Manor Park", "Ilford", "Seven Kings", "Goodmayes", "Chadwell Heath",
      "Romford", "Gidea Park", "Harold Wood", "Brentwood", "Shenfield",
      "Heathrow Terminal 5", "Heathrow Terminals 2 & 3", "Heathrow Terminal 4"
    ]
  }
];

const MODE_LABELS = {
  underground: "London Underground",
  overground: "London Overground",
  dlr: "DLR",
  elizabeth: "Elizabeth line"
};
