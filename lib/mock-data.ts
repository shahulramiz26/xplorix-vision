// Mock data for MVP demo

export const countries = [
  "United States", "Canada", "Australia", "United Kingdom", "South Africa",
  "India", "Brazil", "Chile", "Peru", "Mexico", "Argentina", "China",
  "Russia", "Indonesia", "Philippines", "Ghana", "Zambia", "DRC"
]

export const industryTypes = [
  { value: "EXPLORATION", label: "Exploration" },
  { value: "BLAST_HOLE", label: "Blast Hole" }
]

export const rigTypes = [
  { value: "CORE", label: "Core" },
  { value: "RC", label: "RC" },
  { value: "BLAST_HOLE", label: "Blast Hole" }
]

export const bitTypes = [
  { value: "SURFACE_SET", label: "Surface Set" },
  { value: "IMPREGNATED", label: "Impregnated" },
  { value: "PDC_CORE", label: "PDC Core Bit" },
  { value: "DTH", label: "DTH Bit" },
  { value: "TRICONE", label: "Tricone Bit" }
]

export const holeSizes = [
  "NQ", "HQ", "PQ", "BQ", "AQ",
  "4.5\"", "5\"", "5.5\"", "6\"", "6.5\"", "8\""
]

export const formationTypes = [
  { value: "SOFT", label: "Soft Formation" },
  { value: "MEDIUM", label: "Medium Formation" },
  { value: "HARD", label: "Hard Formation" },
  { value: "MIXED", label: "Mixed" }
]

export const downtimeReasons = [
  "Mechanical Breakdown",
  "Hydraulic Issue",
  "Electrical Fault",
  "Bit Change",
  "Rod Change",
  "Casing Installation",
  "Water Shortage",
  "Fuel Shortage",
  "Operator Delay",
  "Shift Change Delay",
  "Ground Condition Issue",
  "Site Access Issue",
  "Safety Hold",
  "Weather Condition",
  "Waiting for Instruction",
  "Others"
]

export const completionTypes = [
  { value: "INNER_WORN", label: "Inner Worn" },
  { value: "OUTER_WORN", label: "Outer Worn" },
  { value: "FLAT_WORN", label: "Flat Worn" },
  { value: "BROKEN", label: "Broken" }
]

export const accessories = [
  "Adaptor Sub",
  "Air Hose",
  "Casing",
  "Core Barrel",
  "Core Lifter",
  "Core Lifter Case",
  "Coupling",
  "DTH Hammer",
  "Drill Pipe",
  "Inner Tube",
  "Liner",
  "O-Rings",
  "Outer Tube",
  "Reaming Shell",
  "Shock Sub",
  "Stabilizer",
  "Others"
]

export const equipment = [
  "Air Compressor",
  "Booster Compressor",
  "Water Pump",
  "Mud Pump",
  "Generator",
  "Welding Machine",
  "Crane",
  "Excavator",
  "Loader",
  "Service Truck",
  "Others"
]

export const maintenanceTypes = [
  { value: "PREVENTIVE", label: "Preventive Maintenance" },
  { value: "BREAKDOWN", label: "Breakdown Maintenance" },
  { value: "SCHEDULED", label: "Scheduled Service" },
  { value: "COMPONENT", label: "Component Replacement" }
]

export const components = [
  "Engine",
  "Hydraulic System",
  "Electrical System",
  "Rotation Head",
  "Feed System",
  "Compressor",
  "Mud Pump",
  "Water Pump",
  "Transmission",
  "Undercarriage / Mast",
  "Control Panel",
  "Others"
]

export const actions = [
  { value: "REPAIR", label: "Repair Performed" },
  { value: "REPLACE", label: "Part Replaced" },
  { value: "TEMPORARY", label: "Temporary Fix" }
]

export const incidentTypes = [
  { value: "INJURY", label: "Injury" },
  { value: "EQUIPMENT", label: "Equipment Damage" },
  { value: "SAFETY", label: "Safety Violation" }
]

export const severityTypes = [
  { value: "MINOR", label: "Minor" },
  { value: "MAJOR", label: "Major" },
  { value: "CRITICAL", label: "Critical" }
]
