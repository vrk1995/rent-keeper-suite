import { Building2 } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-white/10 py-12 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display font-semibold">RentFlow</span>
          </div>
          
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} RentFlow. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
