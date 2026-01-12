import { motion } from "framer-motion";
import { Building2, Calendar, FileText, DollarSign, Users, Bell } from "lucide-react";

const features = [
  {
    icon: Building2,
    title: "Property Management",
    description: "Track all your properties in one place with detailed information and documents.",
  },
  {
    icon: Calendar,
    title: "Renewal Reminders",
    description: "Never miss a renewal date with automated alerts and calendar integrations.",
  },
  {
    icon: DollarSign,
    title: "Rent Tracking",
    description: "Monitor rent payments, mark receipts, and view payment history at a glance.",
  },
  {
    icon: FileText,
    title: "Invoice Generation",
    description: "Create professional invoices with a single click when rent is due.",
  },
  {
    icon: Users,
    title: "Team Collaboration",
    description: "Invite team members to manage properties and track payments together.",
  },
  {
    icon: Bell,
    title: "Smart Notifications",
    description: "Get notified about upcoming due dates and overdue payments instantly.",
  },
];

const FeaturesSection = () => {
  return (
    <section className="relative py-24 px-6">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/5 to-transparent" />
      
      <div className="relative max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-display font-bold mb-4">
            Everything You Need to
            <span className="text-gradient"> Manage Rentals</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Powerful features designed to streamline your rental property management workflow.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group"
            >
              <div className="glass h-full p-6 rounded-2xl hover:border-primary/30 transition-all duration-300 hover:shadow-xl">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-xl font-display font-semibold mb-2">{feature.title}</h3>
                <p className="text-muted-foreground">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
