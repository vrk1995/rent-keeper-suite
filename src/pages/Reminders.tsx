import { useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Plus, Search, Bell, CheckCircle, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Textarea } from "@/components/ui/textarea";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useReminders, useCreateReminder, useCompleteReminder, useDeleteReminder } from "@/hooks/useReminders";
import { useProperties } from "@/hooks/useProperties";
import { ErrorState } from "@/components/ui/error-state";
import { useIsAdmin } from "@/hooks/useTeam";
import { cn } from "@/lib/utils";
import { CalendarIcon, Trash2 } from "lucide-react";

const reminderTypeLabels: Record<string, string> = {
  rent_due: "Rent Due",
  lease_renewal: "Lease Renewal",
  maintenance: "Maintenance",
  custom: "Custom",
  rent_increment: "Rent Increment",
  expense_expiry: "Coverage Expiry",
};

const reminderTypeColors: Record<string, "glow" | "secondary" | "destructive" | "outline"> = {
  rent_due: "glow",
  lease_renewal: "secondary",
  maintenance: "destructive",
  custom: "outline",
  rent_increment: "glow",
  expense_expiry: "destructive",
};

const Reminders = () => {
  const { data: reminders, isLoading, isError, refetch } = useReminders();
  const { data: properties } = useProperties();
  const createReminder = useCreateReminder();
  const completeReminder = useCompleteReminder();
  const deleteReminder = useDeleteReminder();
  const { isAdmin } = useIsAdmin();
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [reminderDate, setReminderDate] = useState<Date>();
  const [reminderType, setReminderType] = useState("custom");
  const [selectedProperty, setSelectedProperty] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const [deleteReminderId, setDeleteReminderId] = useState<string | null>(null);

  const filteredReminders = reminders?.filter((r) => {
    const matchesSearch = r.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCompleted = showCompleted || !r.is_completed;
    return matchesSearch && matchesCompleted;
  });

  const upcomingReminders = filteredReminders?.filter((r) => !r.is_completed);
  const completedReminders = filteredReminders?.filter((r) => r.is_completed);

  const handleCreate = async () => {
    if (!title || !reminderDate) return;

    await createReminder.mutateAsync({
      title,
      description: description || undefined,
      reminder_date: format(reminderDate, "yyyy-MM-dd"),
      reminder_type: reminderType,
      property_id: selectedProperty || undefined,
    });

    setDialogOpen(false);
    setTitle("");
    setDescription("");
    setReminderDate(undefined);
    setReminderType("custom");
    setSelectedProperty("");
  };

  const handleComplete = async (id: string) => {
    await completeReminder.mutateAsync(id);
  };

  const handleDelete = async () => {
    if (deleteReminderId) {
      await deleteReminder.mutateAsync(deleteReminderId);
      setDeleteReminderId(null);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold">Reminders</h1>
          <p className="text-sm md:text-base text-muted-foreground">Stay on top of important dates</p>
        </div>
        {isAdmin && (
          <Button variant="hero" size="sm" className="w-fit" onClick={() => setDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Reminder
          </Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search reminders..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button
          variant={showCompleted ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowCompleted(!showCompleted)}
        >
          <CheckCircle className="w-4 h-4 mr-2" />
          Completed
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-secondary/30 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : filteredReminders?.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-16 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Bell className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No reminders yet</h3>
          <p className="text-muted-foreground mb-4">
            Set up reminders for rent due dates, lease renewals, and more
          </p>
          {isAdmin && (
            <Button variant="hero" onClick={() => setDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Reminder
            </Button>
          )}
        </motion.div>
      ) : (
        <div className="space-y-6">
          {upcomingReminders && upcomingReminders.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Upcoming
              </h2>
              {upcomingReminders.map((reminder, index) => (
                <motion.div
                  key={reminder.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card className="hover:border-primary/30 transition-all">
                    <CardContent className="flex items-center gap-4 p-4">
                      <Checkbox
                        checked={reminder.is_completed}
                        onCheckedChange={() => handleComplete(reminder.id)}
                        disabled={!isAdmin}
                        className="shrink-0"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{reminder.title}</p>
                          <Badge variant={reminderTypeColors[reminder.reminder_type]}>
                            {reminderTypeLabels[reminder.reminder_type]}
                          </Badge>
                        </div>
                        {reminder.description && (
                          <p className="text-sm text-muted-foreground mt-1">{reminder.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {format(new Date(reminder.reminder_date), "MMM d, yyyy")}
                          </span>
                          {reminder.property && (
                            <span>{reminder.property.name}</span>
                          )}
                        </div>
                      </div>
                      {isAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Delete reminder"
                          onClick={() => setDeleteReminderId(reminder.id)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}

          {showCompleted && completedReminders && completedReminders.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-muted-foreground">
                <CheckCircle className="w-5 h-5" />
                Completed
              </h2>
              {completedReminders.map((reminder) => (
                <Card key={reminder.id} className="opacity-60">
                  <CardContent className="flex items-center gap-4 p-4">
                    <Checkbox checked disabled className="shrink-0" />
                    <div className="flex-1">
                      <p className="font-medium line-through">{reminder.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(reminder.reminder_date), "MMM d, yyyy")}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Reminder Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Reminder</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                placeholder="e.g., Collect rent from Unit 101"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea
                placeholder="Add any notes..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={reminderType} onValueChange={setReminderType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rent_due">Rent Due</SelectItem>
                    <SelectItem value="lease_renewal">Lease Renewal</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Property (Optional)</Label>
                <SearchableSelect
                  options={[
                    { value: "", label: "None" },
                    ...(properties?.map((p) => ({ value: p.id, label: p.name })) || []),
                  ]}
                  value={selectedProperty}
                  onValueChange={setSelectedProperty}
                  placeholder="Select property"
                  searchPlaceholder="Search properties..."
                  triggerClassName="w-full"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Reminder Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !reminderDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {reminderDate ? format(reminderDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={reminderDate}
                    onSelect={setReminderDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="hero"
                onClick={handleCreate}
                disabled={createReminder.isPending || !title || !reminderDate}
              >
                Add Reminder
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteReminderId} onOpenChange={() => setDeleteReminderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Reminder</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this reminder? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Reminders;
