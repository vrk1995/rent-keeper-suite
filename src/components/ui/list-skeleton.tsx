import { Skeleton } from "@/components/ui/skeleton";

interface CardListSkeletonProps {
  count?: number;
  className?: string;
}

export const CardListSkeleton = ({ count = 3, className = "h-48" }: CardListSkeletonProps) => (
  <div className="grid grid-cols-1 gap-4">
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} className={`${className} bg-secondary/30 rounded-xl`} />
    ))}
  </div>
);

interface RowListSkeletonProps {
  className?: string;
}

export const RowListSkeleton = ({ className = "h-64" }: RowListSkeletonProps) => (
  <Skeleton className={`${className} bg-secondary/30 rounded-xl`} />
);
