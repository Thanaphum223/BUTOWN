import { Button } from "antd";
import { BellOutlined, CheckOutlined, EyeOutlined, LikeOutlined } from "@ant-design/icons";

type Item = {
  id: string;
  category_name: string;
  votes?: number;
  voted?: boolean;
  following?: boolean;
};
type Props = {
  item: Item;
  disabled?: boolean;
  voting?: boolean;
  following?: boolean;
  onDetails: () => void;
  onVote: () => void;
  onFollow: () => void;
};

export default function CommunityActions({
  item,
  disabled,
  voting,
  following,
  onDetails,
  onVote,
  onFollow,
}: Props) {
  return (
    <div className="community-issue-actions">
      <Button aria-label="ดูรายละเอียด" icon={<EyeOutlined />} onClick={onDetails}>
        ดูรายละเอียด
      </Button>
      <Button
        disabled={disabled}
        icon={item.following ? <CheckOutlined /> : <BellOutlined />}
        type={item.following ? "primary" : "default"}
        loading={following}
        aria-pressed={!!item.following}
        aria-label={item.following ? "ติดตามแล้ว" : "ติดตาม"}
        onClick={onFollow}
      >
        {item.following ? "ติดตามแล้ว" : "ติดตาม"}
      </Button>
      <Button
        disabled={disabled}
        icon={<LikeOutlined />}
        loading={voting}
        type={item.voted ? "primary" : "default"}
        aria-pressed={!!item.voted}
        aria-label={`${item.voted ? "ยกเลิกโหวต" : "โหวต"} ${item.category_name} #${item.id.slice(0, 8)}`}
        onClick={onVote}
      >
        {item.votes ?? 0} โหวต
      </Button>
    </div>
  );
}
