import "./RankBadge.scss";

type Rank = "E" | "D" | "C" | "B" | "A" | "S" | "S+" | "SS" | "SSS";

type RankBadgeProps = {
  rank: Rank;
};

export default function RankBadge({ rank }: RankBadgeProps) {
  return (
    <span className="rank-badge" data-rank={rank}>
      {rank}
    </span>
  );
}
