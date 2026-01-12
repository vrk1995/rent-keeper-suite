import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

const CTASection = () => {
  const navigate = useNavigate();

  return (
    <section className="relative py-24 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-3xl glass-strong p-12 md:p-16 text-center"
        >
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
          
          {/* Glow effect */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-primary/30 blur-3xl" />

          <div className="relative z-10">
            <h2 className="text-4xl md:text-5xl font-display font-bold mb-4">
              Ready to Simplify Your
              <br />
              <span className="text-gradient">Rental Management?</span>
            </h2>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
              Join thousands of property managers who trust RentFlow to handle their rental operations.
            </p>
            <Button 
              variant="hero" 
              size="xl"
              onClick={() => navigate("/auth")}
            >
              Start Free Trial
              <ArrowRight className="w-5 h-5" />
            </Button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CTASection;
