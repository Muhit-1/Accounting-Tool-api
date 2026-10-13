-- The system category for orders paid out of the fund gets its "(auto)" tag, so a
-- hand-made category called "Orders paid from fund" (like the old sheet's block)
-- is not confused with it.
UPDATE `categories` SET `name` = 'Orders paid from fund (auto)' WHERE `systemKey` = 'ORDERS_OUT' AND `name` = 'Orders paid from fund';
