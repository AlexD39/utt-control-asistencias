INSERT INTO event_staff (event_id, user_id)
SELECT e.id, u.id
FROM events e
CROSS JOIN users u
WHERE u.role <> 'super_admin'
ON CONFLICT DO NOTHING;
