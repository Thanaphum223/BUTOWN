import { useI18n } from "./i18n/useI18n";
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
  const { t } = useI18n();
  return (
    <div className="community-issue-actions">
      <Button aria-label={t("ดูรายละเอียด")} icon={<EyeOutlined />} onClick={onDetails}>
        {t("ดูรายละเอียด")}
      </Button>
      <Button
        disabled={disabled}
        icon={item.following ? <CheckOutlined /> : <BellOutlined />}
        type={item.following ? "primary" : "default"}
        loading={following}
        aria-pressed={!!item.following}
        aria-label={item.following ? t("ติดตามแล้ว") : t("ติดตาม")}
        onClick={onFollow}
      >
        {item.following ? t("ติดตามแล้ว") : t("ติดตาม")}
      </Button>
      <Button
        disabled={disabled}
        icon={<LikeOutlined />}
        loading={voting}
        type={item.voted ? "primary" : "default"}
        aria-pressed={!!item.voted}
        aria-label={`${item.voted ? t("ยกเลิกโหวต") : t("โหวต")} ${item.category_name} #${item.id.slice(0, 8)}`}
        onClick={onVote}
      >
        {item.votes ?? 0} {t("โหวต")}
      </Button>
    </div>
  );
}
