"use client";

import React from "react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { motion } from "framer-motion";

// Color palette matching the dark theme
const COLORS = {
  primary: "var(--x-blue)",
  accent: "var(--x-amber)",
  purple: "var(--x-purple)",
  warning: "var(--x-red)",
  danger: "var(--x-red-d)",
  cyan: "var(--x-cyan)",
  pink: "var(--x-pink)",
  slate: "var(--x-faint)",
  emerald: "var(--x-green)",
};

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: "easeOut",
    },
  },
};

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[var(--x-raised2)] border border-[color:var(--x-border2)] rounded-lg p-3 shadow-xl">
        <p className="text-[color:var(--x-text)] font-medium mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
            {entry.name.includes("Hours") ? " hrs" : entry.name.includes("Rate") ? "%" : ""}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

// Performance Line Chart
export function PerformanceChart({ data }: { data: any[] }) {
  return (
    <motion.div
      variants={itemVariants}
      className="w-full h-[300px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--x-border2)" />
          <XAxis dataKey="name" stroke="var(--x-faint)" fontSize={12} />
          <YAxis stroke="var(--x-faint)" fontSize={12} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Line
            type="monotone"
            dataKey="efficiency"
            name="Efficiency %"
            stroke={COLORS.primary}
            strokeWidth={3}
            dot={{ fill: COLORS.primary, strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
          <Line
            type="monotone"
            dataKey="target"
            name="Target %"
            stroke={COLORS.emerald}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// Drilling Activity Bar Chart
export function DrillingActivityChart({ data }: { data: any[] }) {
  return (
    <motion.div
      variants={itemVariants}
      className="w-full h-[300px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--x-border2)" />
          <XAxis dataKey="day" stroke="var(--x-faint)" fontSize={12} />
          <YAxis stroke="var(--x-faint)" fontSize={12} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="drilling" name="Drilling Hours" fill={COLORS.emerald} radius={[4, 4, 0, 0]} />
          <Bar dataKey="downtime" name="Downtime" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
          <Line
            type="monotone"
            dataKey="efficiency"
            name="Efficiency %"
            stroke={COLORS.primary}
            strokeWidth={2}
          />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// Consumption Area Chart
export function ConsumptionChart({ data }: { data: any[] }) {
  return (
    <motion.div
      variants={itemVariants}
      className="w-full h-[300px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--x-border2)" />
          <XAxis dataKey="month" stroke="var(--x-faint)" fontSize={12} />
          <YAxis stroke="var(--x-faint)" fontSize={12} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area
            type="monotone"
            dataKey="consumption"
            name="Consumption"
            stroke={COLORS.purple}
            fill={COLORS.purple}
            fillOpacity={0.3}
          />
          <Area
            type="monotone"
            dataKey="budget"
            name="Budget"
            stroke={COLORS.accent}
            fill={COLORS.accent}
            fillOpacity={0.1}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// Safety Pie Chart
export function SafetyChart({ data }: { data: any[] }) {
  return (
    <motion.div
      variants={itemVariants}
      className="w-full h-[300px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={100}
            paddingAngle={5}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// Crew Performance Radar Chart
export function CrewPerformanceChart({ data }: { data: any[] }) {
  return (
    <motion.div
      variants={itemVariants}
      className="w-full h-[300px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
          <PolarGrid stroke="var(--x-border2)" />
          <PolarAngleAxis dataKey="subject" stroke="var(--x-faint)" fontSize={12} />
          <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="var(--x-faint)" />
          <Radar
            name="Current"
            dataKey="A"
            stroke={COLORS.primary}
            fill={COLORS.primary}
            fillOpacity={0.3}
          />
          <Radar
            name="Target"
            dataKey="B"
            stroke={COLORS.emerald}
            fill={COLORS.emerald}
            fillOpacity={0.1}
          />
          <Legend />
          <Tooltip content={<CustomTooltip />} />
        </RadarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// Maintenance Timeline Chart
export function MaintenanceTimelineChart({ data }: { data: any[] }) {
  return (
    <motion.div
      variants={itemVariants}
      className="w-full h-[300px]"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--x-border2)" />
          <XAxis type="number" stroke="var(--x-faint)" fontSize={12} />
          <YAxis dataKey="equipment" type="category" stroke="var(--x-faint)" fontSize={12} width={100} />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Bar dataKey="completed" name="Completed" stackId="a" fill={COLORS.emerald} radius={[0, 4, 4, 0]} />
          <Bar dataKey="pending" name="Pending" stackId="a" fill={COLORS.accent} radius={[0, 4, 4, 0]} />
          <Bar dataKey="overdue" name="Overdue" stackId="a" fill={COLORS.danger} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// Export animation variants for use in parent components
export { containerVariants, itemVariants };
