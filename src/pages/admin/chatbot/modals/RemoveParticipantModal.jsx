import React from "react";
import { Modal, Button, Row, Form } from "react-bootstrap";
import FormField from "../../../../components/FormFields/FormField";

const RemoveParticipantModal = ({
  show,
  onHide,
  handleSubmit,
  onSubmit,
  control,
  register,
  errors,
  touchedFields,
  fields = [],
  removing = false,
  reset,
}) => {
  return (
    <Modal
      show={show}
      onHide={() => {
        if (removing) return;
        onHide();
        reset({ user_id: null });
      }}
      centered
    >
      <Form onSubmit={handleSubmit(onSubmit)}>
        <Modal.Header closeButton>
          <Modal.Title>Remove Participant</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Row>
            {fields.map((field) => (
              <FormField
                key={field.name}
                field={field}
                control={control}
                register={register}
                errors={errors}
                touchedFields={touchedFields}
              />
            ))}
          </Row>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={() => {
              if (removing) return;
              onHide();
              reset({ user_id: null });
            }}
            disabled={removing}
          >
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={removing}>
            {removing ? "Removing..." : "Remove"}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default RemoveParticipantModal;
